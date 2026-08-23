/**
 * The provider boundary.
 *
 * The rest of the application asks for writing assistance and never learns what answered.
 * That is a requirement rather than tidiness — the specification calls for a small
 * application-level interface, forbids depending on a specific model SDK, and requires that
 * the product keep working when no provider is available at all. It is also what makes the
 * free-tier strategy possible: the choice of model is a deployment decision, not an
 * architectural one.
 *
 * ## No provider is configured, and that is the shipped state
 *
 * {@link unavailableProvider} is the default, and it fails every request. This is not a stub
 * pretending to work — it is the honest state of a product with no model behind it, and
 * wiring it as the default has a real benefit: the deterministic fallback path is the one that
 * runs, so it is exercised constantly rather than being an untested branch that only executes
 * during an outage.
 *
 * ## What a provider implementation must not do
 *
 * Read its own configuration from anywhere but its constructor, hold user data beyond the
 * call, log request content, or reach the browser. A provider is constructed server-side with
 * credentials passed in, so nothing here has to know what a secret is.
 */

import { createHash } from "node:crypto";

/**
 * What a provider is asked to do.
 *
 * Two strings and a ceiling. Deliberately not a message array, a temperature, a tool
 * definition or a model name: those are a provider's own concern, and putting them here would
 * be the SDK leaking through the interface it exists to hide.
 */
export type ProviderRequest = {
  /** Our contract. Assembled by the prompt library; never user-supplied. */
  system: string;
  /** The rendered context. Contains user content, inside delimited blocks. */
  input: string;
  /** A ceiling on the answer. A provider unable to honour it should return what it has. */
  maxOutputCharacters: number;
};

export const providerFailures = [
  /** Nothing is configured, or the configured provider has been switched off. */
  "unavailable",
  /** Took longer than the limit allows. Retryable. */
  "timeout",
  /** A rate limit, a 5xx, a dropped connection. Retryable. */
  "transient",
  /** The provider declined — a safety filter, an invalid key, a quota. Not retryable. */
  "rejected",
  /** The request exceeded the configured input ceiling and was not sent. */
  "oversized",
] as const;

export type ProviderFailure = (typeof providerFailures)[number];

const retryable: ReadonlySet<ProviderFailure> = new Set<ProviderFailure>(["timeout", "transient"]);

export function isRetryable(failure: ProviderFailure): boolean {
  return retryable.has(failure);
}

/**
 * What a provider returns.
 *
 * Never a thrown error: a failure is an expected outcome of asking a network service for
 * help, and the caller's next step — fall back to the user's own words — is the same for all
 * five kinds. Token counts are optional because not every provider reports them, and cost
 * metering must record "unknown" rather than "zero" when it does not.
 */
export type ProviderResult =
  | {
      ok: true;
      text: string;
      /** The specific model that answered, for the usage record. */
      model: string | null;
      inputTokens?: number;
      outputTokens?: number;
    }
  | { ok: false; failure: ProviderFailure; detail: string };

/**
 * The interface the application depends on.
 *
 * One method. A provider is given an `AbortSignal` and is expected to honour it; the runner
 * also races the call against its own timer, because a provider that ignores the signal must
 * not be able to hold a request open indefinitely.
 */
export type WritingProvider = {
  /** Recorded against usage. `"unavailable"`, later `"google"`, `"groq"`. */
  readonly id: string;
  /** The default model, where the provider has one. */
  readonly model: string | null;
  complete(request: ProviderRequest, signal: AbortSignal): Promise<ProviderResult>;
};

/**
 * The limits every request is bounded by.
 *
 * Configuration, in one place, because the requirement is that limits be configurable and
 * because these five numbers are the entire cost-control surface of the AI layer. Two attempts
 * rather than three: a retry doubles the cost of a failing request, and a provider that failed
 * twice inside twenty seconds is not going to succeed on the third try before the user gives
 * up on the page.
 */
export type ProviderLimits = {
  maxInputCharacters: number;
  maxOutputCharacters: number;
  timeoutMs: number;
  /** Total attempts, not retries. 1 means no retry. */
  maxAttempts: number;
  /** Waited between attempts. */
  retryDelayMs: number;
};

export const defaultProviderLimits: ProviderLimits = {
  maxInputCharacters: 24_000,
  maxOutputCharacters: 8_000,
  timeoutMs: 20_000,
  maxAttempts: 2,
  retryDelayMs: 400,
};

/**
 * The provider used when none is configured.
 *
 * Every request fails with `unavailable`, which the orchestration turns into the user's own
 * text, unchanged, with the failure recorded. No credentials, no network, no cost.
 */
export const unavailableProvider: WritingProvider = {
  id: "unavailable",
  model: null,
  async complete() {
    return { ok: false, failure: "unavailable", detail: "no writing provider is configured" };
  },
};

export type ProviderRunOptions = {
  /** Injected so a retry can be tested without waiting for it. */
  sleep?: (milliseconds: number) => Promise<void>;
  /** Injected so latency can be asserted. Monotonic in production. */
  now?: () => number;
};

export type ProviderRun = ProviderResult & {
  /** How many times the provider was called. 0 when the request was refused before sending. */
  attempts: number;
  /** Wall-clock milliseconds across all attempts, for the usage record. */
  elapsedMs: number;
  provider: string;
};

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

/**
 * One attempt, bounded by the timeout.
 *
 * The signal is passed to the provider *and* the call is raced against a timer. A provider
 * that honours the signal returns promptly; one that does not is abandoned, and the timer is
 * cleared either way so a pending timeout cannot keep a serverless invocation alive.
 */
async function attempt(
  provider: WritingProvider,
  request: ProviderRequest,
  timeoutMs: number,
): Promise<ProviderResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const expiry = new Promise<ProviderResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ ok: false, failure: "timeout", detail: `no response within ${timeoutMs}ms` });
    }, timeoutMs);
  });

  try {
    return await Promise.race([provider.complete(request, controller.signal), expiry]);
  } catch (error) {
    /*
     * A provider that throws instead of returning a failure is treated as transient. Not
     * because it necessarily is, but because the alternative is letting an SDK's exception
     * escape into a request handler, and the retry is bounded anyway.
     */
    return {
      ok: false,
      failure: "transient",
      detail: error instanceof Error ? error.name : "provider threw",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call a provider within the configured limits.
 *
 * Refuses an oversized request without sending it — a request over the ceiling would either
 * be rejected by the provider or silently truncated by it, and both cost money to discover.
 * Retries only what is worth retrying: a rejection or an unavailable provider will fail again
 * identically, and retrying it would double the cost of an outage.
 */
export async function runProvider(
  provider: WritingProvider,
  request: ProviderRequest,
  limits: ProviderLimits = defaultProviderLimits,
  options: ProviderRunOptions = {},
): Promise<ProviderRun> {
  const sleep = options.sleep ?? wait;
  const clock = options.now ?? (() => Date.now());
  const started = clock();

  if (request.input.length + request.system.length > limits.maxInputCharacters) {
    return {
      ok: false,
      failure: "oversized",
      detail: `${request.input.length + request.system.length}/${limits.maxInputCharacters} characters`,
      attempts: 0,
      elapsedMs: clock() - started,
      provider: provider.id,
    };
  }

  const total = Math.max(1, limits.maxAttempts);
  let last: ProviderResult = {
    ok: false,
    failure: "unavailable",
    detail: "no attempt was made",
  };

  for (let made = 1; made <= total; made += 1) {
    last = await attempt(provider, request, limits.timeoutMs);

    if (last.ok || !isRetryable(last.failure) || made === total) {
      return { ...last, attempts: made, elapsedMs: clock() - started, provider: provider.id };
    }

    await sleep(limits.retryDelayMs);
  }

  /* Unreachable: the loop returns on its final iteration. Present because the compiler
   * cannot see that, and because a silent `undefined` here would be worse than a value. */
  return { ...last, attempts: total, elapsedMs: clock() - started, provider: provider.id };
}

/**
 * A stable identifier for a request's content.
 *
 * The key both caching and duplicate suppression need: the same context and the same prompt
 * version produce the same fingerprint, so a second identical request can be answered from
 * the first. Truncated to 32 hex characters — collision-resistant enough for a per-user cache
 * key, and short enough to store and index comfortably.
 *
 * Nothing caches yet. The function exists because the fingerprint has to be computed from the
 * request as sent, and defining it anywhere else later would mean two definitions of "the
 * same request".
 *
 * The `\0` between fields is a separator, not decoration: hashing the concatenation alone
 * would give a longer contract with a shorter context the same digest as the reverse, and a
 * cache keyed on it would answer one request with another request's answer. It is written as
 * an escape rather than as a literal control character so the file stays a text file to git,
 * grep and every diff tool.
 */
export function requestFingerprint(promptId: string, request: ProviderRequest): string {
  return createHash("sha256")
    .update(promptId)
    .update("\0")
    .update(request.system)
    .update("\0")
    .update(request.input)
    .digest("hex")
    .slice(0, 32);
}
