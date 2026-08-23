import { describe, expect, it } from "vitest";
import {
  defaultProviderLimits,
  isRetryable,
  providerFailures,
  requestFingerprint,
  unavailableProvider,
  type ProviderLimits,
  type ProviderRequest,
  type ProviderResult,
  type WritingProvider,
} from "./index";
/* `runProvider` is the orchestration's own step, not something a feature calls directly. */
import { runProvider } from "./provider";

/*
 * The cost-control surface of the whole AI layer is five numbers and this function, so the
 * tests are about money and time rather than about output: a request too large to be worth
 * sending is refused before it is sent, a failure that will fail again is not retried, and a
 * provider that ignores its abort signal cannot hold a serverless invocation open.
 *
 * Every clock and every delay is injected. A test that waits twenty seconds to prove a timeout
 * works gets deleted by the next person in a hurry.
 */

const request = (overrides: Partial<ProviderRequest> = {}): ProviderRequest => ({
  system: "contract",
  input: "context",
  maxOutputCharacters: 8_000,
  ...overrides,
});

const limits = (overrides: Partial<ProviderLimits> = {}): ProviderLimits => ({
  ...defaultProviderLimits,
  timeoutMs: 50,
  retryDelayMs: 1,
  ...overrides,
});

const stub = (
  complete: WritingProvider["complete"],
  id = "stub",
  model: string | null = "stub-1",
): WritingProvider => ({ id, model, complete });

const answering = (...results: ProviderResult[]) => {
  const calls: ProviderRequest[] = [];
  const provider = stub(async (given) => {
    calls.push(given);

    return results[Math.min(calls.length - 1, results.length - 1)] as ProviderResult;
  });

  return { provider, calls };
};

const ok = (text: string): ProviderResult => ({ ok: true, text, model: "stub-1" });
const fails = (failure: (typeof providerFailures)[number]): ProviderResult => ({
  ok: false,
  failure,
  detail: failure,
});

describe("unavailableProvider", () => {
  it("is the honest state of a product with no model behind it", () => {
    expect(unavailableProvider.id).toBe("unavailable");
    expect(unavailableProvider.model).toBeNull();
  });

  it("fails every request without a network call", async () => {
    const run = await runProvider(unavailableProvider, request(), limits());

    expect(run).toMatchObject({ ok: false, failure: "unavailable", provider: "unavailable" });
  });

  it("is not retried, because it will fail identically", async () => {
    const run = await runProvider(unavailableProvider, request(), limits({ maxAttempts: 3 }));

    expect(run.attempts).toBe(1);
  });
});

describe("isRetryable", () => {
  it("retries only what a second attempt could fix", () => {
    expect(isRetryable("timeout")).toBe(true);
    expect(isRetryable("transient")).toBe(true);
    expect(isRetryable("unavailable")).toBe(false);
    expect(isRetryable("rejected")).toBe(false);
    expect(isRetryable("oversized")).toBe(false);
  });

  it("has an answer for every declared failure", () => {
    for (const failure of providerFailures) {
      expect(typeof isRetryable(failure), failure).toBe("boolean");
    }
  });
});

describe("runProvider", () => {
  it("returns what the provider returned", async () => {
    const { provider, calls } = answering(ok("answer"));
    const run = await runProvider(provider, request(), limits());

    expect(run).toMatchObject({ ok: true, text: "answer", attempts: 1, provider: "stub" });
    expect(calls).toHaveLength(1);
  });

  it("refuses an oversized request without sending it", async () => {
    const { provider, calls } = answering(ok("answer"));
    const run = await runProvider(
      provider,
      request({ system: "x".repeat(60), input: "y".repeat(60) }),
      limits({ maxInputCharacters: 100 }),
    );

    expect(run).toMatchObject({ ok: false, failure: "oversized", attempts: 0 });
    expect(calls).toEqual([]);
  });

  it("counts the contract as well as the context against the ceiling", async () => {
    /* The system prompt is the larger half of most requests. Measuring only the context would
     * let every request exceed the real limit by the size of the contract. */
    const { provider } = answering(ok("answer"));
    const run = await runProvider(
      provider,
      request({ system: "x".repeat(99), input: "y" }),
      limits({ maxInputCharacters: 99 }),
    );

    expect(run).toMatchObject({ failure: "oversized" });
  });

  it("retries a transient failure and reports the successful attempt", async () => {
    const delays: number[] = [];
    const { provider, calls } = answering(fails("transient"), ok("second time"));

    const run = await runProvider(provider, request(), limits({ maxAttempts: 2 }), {
      sleep: async (ms) => {
        delays.push(ms);
      },
    });

    expect(run).toMatchObject({ ok: true, text: "second time", attempts: 2 });
    expect(calls).toHaveLength(2);
    expect(delays).toEqual([1]);
  });

  it("stops at the configured number of attempts", async () => {
    const { provider, calls } = answering(fails("transient"));

    const run = await runProvider(provider, request(), limits({ maxAttempts: 2 }), {
      sleep: async () => {},
    });

    expect(run).toMatchObject({ ok: false, failure: "transient", attempts: 2 });
    expect(calls).toHaveLength(2);
  });

  it("does not retry a rejection, which would double the cost of an outage", async () => {
    const { provider, calls } = answering(fails("rejected"));

    const run = await runProvider(provider, request(), limits({ maxAttempts: 3 }));

    expect(run).toMatchObject({ failure: "rejected", attempts: 1 });
    expect(calls).toHaveLength(1);
  });

  it("makes one attempt when told to make none", async () => {
    const { provider, calls } = answering(ok("answer"));

    const run = await runProvider(provider, request(), limits({ maxAttempts: 0 }));

    expect(run.attempts).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it("times out a provider that never answers", async () => {
    const provider = stub(() => new Promise<ProviderResult>(() => {}));

    const run = await runProvider(provider, request(), limits({ timeoutMs: 5, maxAttempts: 1 }));

    expect(run).toMatchObject({ ok: false, failure: "timeout", attempts: 1 });
  });

  it("aborts the signal it gave a provider that ignored the timeout", async () => {
    let captured: AbortSignal | null = null;

    const provider = stub((_given, signal) => {
      captured = signal;

      return new Promise<ProviderResult>(() => {});
    });

    await runProvider(provider, request(), limits({ timeoutMs: 5, maxAttempts: 1 }));

    expect(captured).toBeInstanceOf(AbortSignal);
    expect((captured as unknown as AbortSignal).aborted).toBe(true);
  });

  it("gives a provider an unaborted signal to start with", async () => {
    let abortedAtCall: boolean | null = null;

    const provider = stub(async (_given, signal) => {
      abortedAtCall = signal.aborted;

      return ok("answer");
    });

    await runProvider(provider, request(), limits());

    expect(abortedAtCall).toBe(false);
  });

  it("treats a provider that throws as transient rather than letting it escape", async () => {
    const provider = stub(async () => {
      throw new TypeError("fetch failed");
    });

    const run = await runProvider(provider, request(), limits({ maxAttempts: 1 }));

    expect(run).toMatchObject({ ok: false, failure: "transient", detail: "TypeError" });
  });

  it("retries a throwing provider, since the cause may be the network", async () => {
    let calls = 0;
    const provider = stub(async () => {
      calls += 1;
      if (calls === 1) throw new Error("socket hang up");

      return ok("second time");
    });

    const run = await runProvider(provider, request(), limits({ maxAttempts: 2 }), {
      sleep: async () => {},
    });

    expect(run).toMatchObject({ ok: true, attempts: 2 });
  });

  it("measures elapsed time on the clock it was given", async () => {
    const readings = [1_000, 1_350];
    const { provider } = answering(ok("answer"));

    const run = await runProvider(provider, request(), limits(), {
      now: () => readings.shift() ?? 1_350,
    });

    expect(run.elapsedMs).toBe(350);
  });

  it("passes the output ceiling through to the provider", async () => {
    const { provider, calls } = answering(ok("answer"));

    await runProvider(provider, request({ maxOutputCharacters: 1_234 }), limits());

    expect(calls[0]?.maxOutputCharacters).toBe(1_234);
  });
});

describe("requestFingerprint", () => {
  it("is stable for the same request", () => {
    expect(requestFingerprint("resume_tailoring@1", request())).toBe(
      requestFingerprint("resume_tailoring@1", request()),
    );
  });

  it("is short enough to store and index", () => {
    const fingerprint = requestFingerprint("resume_tailoring@1", request());

    expect(fingerprint).toHaveLength(32);
    expect(fingerprint).toMatch(/^[0-9a-f]{32}$/);
  });

  it("changes when the prompt version changes", () => {
    expect(requestFingerprint("resume_tailoring@1", request())).not.toBe(
      requestFingerprint("resume_tailoring@2", request()),
    );
  });

  it("changes when the context changes", () => {
    expect(requestFingerprint("resume_tailoring@1", request())).not.toBe(
      requestFingerprint("resume_tailoring@1", request({ input: "different context" })),
    );
  });

  it("distinguishes the same characters split differently", () => {
    /* Without a separator, a longer contract and a shorter context would hash the same as the
     * reverse — and a cache keyed on it would answer one request with another's answer. */
    expect(requestFingerprint("p", request({ system: "ab", input: "c" }))).not.toBe(
      requestFingerprint("p", request({ system: "a", input: "bc" })),
    );
  });

  it("ignores the output ceiling, which is not part of the content", () => {
    expect(requestFingerprint("p", request({ maxOutputCharacters: 10 }))).toBe(
      requestFingerprint("p", request({ maxOutputCharacters: 20 })),
    );
  });
});
