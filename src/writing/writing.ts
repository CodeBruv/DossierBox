/**
 * The writing pipeline.
 *
 * The specification gives the chain and its inversion:
 *
 * ```text
 * Engine → Context → AI writing assistance → Validation → Document renderer     correct
 * User → AI → Entire document                                                   wrong
 * ```
 *
 * This module is the middle three steps, in that order, with no way to skip one. A caller
 * hands in a context draft and gets back an outcome; there is no exported path that reaches a
 * provider without bounding the context first, and none that returns text without checking it
 * against the facts.
 *
 * ## Three outcomes, and what a caller does with each
 *
 * - **written** — usable text. Validated. Attach it to the document.
 * - **insufficient** — the facts did not support what was asked. Ask the user for what is
 *   missing, or compose without it. No provider was called and nothing was charged.
 * - **declined** — the provider failed, answered in the wrong shape, or answered with
 *   something that was not supported by the facts. Use the user's own words.
 *
 * A declined outcome deliberately carries no replacement text. The caller already holds the
 * user's own words — they are what it put in the context — and having the writing layer hand
 * them back would make it responsible for composing a document, which is the engine's job.
 * This is the deterministic fallback the architecture requires, and it is a fallback the
 * caller performs by doing nothing.
 *
 * ## Nothing here persists
 *
 * A {@link UsageRecord} is returned, not written. Metering has no table yet, and inventing one
 * before a provider exists would mean a schema shaped around a guess. The record is complete
 * enough to insert as one row when there is somewhere to put it.
 */

import type { PlanKey } from "@/entitlements/plan-keys";
import {
  workloadUnits,
  type ProviderCost,
  type UsageOutcome,
  type UsageRecord,
  type WorkloadKind,
} from "@/entitlements/usage";
import {
  buildWritingContext,
  defaultWritingContextLimits,
  renderWritingContext,
  type WritingContext,
  type WritingContextDraft,
  type WritingContextLimits,
} from "./context";
import { reviewOutput, type WritingFinding } from "./integrity";
import {
  constraintsFor,
  missingRequirements,
  promptFor,
  promptMarkers,
  systemPrompt,
  type ContextRequirement,
} from "./prompts";
import {
  defaultProviderLimits,
  requestFingerprint,
  runProvider,
  unavailableProvider,
  type ProviderFailure,
  type ProviderLimits,
  type ProviderRunOptions,
  type WritingProvider,
} from "./provider";
import {
  generatedText,
  hasGeneratedText,
  parseWritingResponse,
  type ResponseProblem,
  type WritingOutput,
} from "./response";

/**
 * Who the work is for, for metering.
 *
 * Separate from the context because the context is what a model sees and this is not: a user
 * id has no business in a prompt. The plan is the one in force at the time of the request,
 * resolved by the entitlement layer, and it is recorded rather than looked up so a month of
 * usage stays readable after someone upgrades.
 */
export type WritingActor = {
  userId: string;
  plan: PlanKey;
  documentId?: string | null;
  applicationId?: string | null;
};

export type WritingOptions = {
  /** Defaults to {@link unavailableProvider} — no model, every request declined. */
  provider?: WritingProvider;
  limits?: ProviderLimits;
  contextLimits?: WritingContextLimits;
  /** Injected, so a usage record's timestamp is not whatever the test ran at. */
  now?: Date;
  run?: ProviderRunOptions;
};

type OutcomeBase = {
  workload: WorkloadKind;
  /** `resume_tailoring@1`. Which contract produced this. */
  promptId: string;
  /** The bounded context as sent. Returned so a caller can report what was considered. */
  context: WritingContext;
  usage: UsageRecord;
};

export type WritingOutcome =
  | (OutcomeBase & {
      status: "written";
      output: WritingOutput;
      /** Stable per request content — the key a cache or a duplicate check would use. */
      fingerprint: string;
      /** What the model said it needed and did not have. Advisory; the text is still usable. */
      missing: readonly string[];
    })
  | (OutcomeBase & {
      status: "insufficient";
      /** What the prompt required and the context did not have. */
      missing: readonly ContextRequirement[];
    })
  | (OutcomeBase & { status: "declined"; cause: "provider"; failure: ProviderFailure })
  | (OutcomeBase & { status: "declined"; cause: "response"; problem: ResponseProblem })
  | (OutcomeBase & {
      status: "declined";
      cause: "review";
      /** Why the text was refused. For server-side logging, not for a user. */
      findings: readonly WritingFinding[];
    });

const costOf = (
  inputTokens: number | undefined,
  outputTokens: number | undefined,
): ProviderCost | null =>
  inputTokens === undefined && outputTokens === undefined ? null : { inputTokens, outputTokens };

/**
 * Ask for writing assistance.
 *
 * The only entry point. It builds the context (bounding it), checks the prompt's requirements
 * (before spending anything), calls the provider (within its limits), parses the answer
 * (tolerantly of formatting, strictly of content), and checks the result against the facts
 * (refusing rather than publishing). Each step can only fail into an outcome.
 */
export async function requestWriting(
  draft: WritingContextDraft,
  actor: WritingActor,
  options: WritingOptions = {},
): Promise<WritingOutcome> {
  const prompt = promptFor(draft.workload);
  const provider = options.provider ?? unavailableProvider;
  const limits = options.limits ?? defaultProviderLimits;
  const occurredAt = options.now ?? new Date();

  /*
   * Constraints are resolved here rather than in `buildWritingContext`, which would have to
   * import the prompt library to do it and close a cycle. The order is deliberate: module
   * defaults, then what the workload implies, then what the caller says. The caller wins
   * because an opportunity's own word limit is stricter than any default we could choose.
   */
  const context = buildWritingContext(
    { ...draft, constraints: constraintsFor(prompt, draft.constraints) },
    options.contextLimits ?? defaultWritingContextLimits,
  );

  const estimated = workloadUnits(draft.workload);
  const base = { workload: draft.workload, promptId: prompt.id, context };

  const meter = (
    outcome: UsageOutcome,
    detail: {
      units?: number;
      provider?: string | null;
      model?: string | null;
      cost?: ProviderCost | null;
    } = {},
  ): UsageRecord => ({
    userId: actor.userId,
    workload: draft.workload,
    outcome,
    estimatedUnits: estimated,
    /*
     * Actual equals estimated, and will until a provider reports something to measure
     * against. Stated rather than hidden: the field exists because the two will diverge, not
     * because they do now.
     */
    units: detail.units ?? estimated,
    plan: actor.plan,
    provider: detail.provider ?? null,
    model: detail.model ?? null,
    providerCost: detail.cost ?? null,
    occurredAt,
    documentId: actor.documentId ?? null,
    applicationId: actor.applicationId ?? null,
  });

  /* Requirements first: a request that cannot succeed must not cost anything to discover. */
  const unmet = missingRequirements(prompt, context);

  if (unmet.length > 0) {
    return { ...base, status: "insufficient", missing: unmet, usage: meter("failed") };
  }

  const request = {
    system: systemPrompt(prompt),
    input: renderWritingContext(context),
    maxOutputCharacters: limits.maxOutputCharacters,
  };

  const run = await runProvider(provider, request, limits, options.run);

  if (!run.ok) {
    return {
      ...base,
      status: "declined",
      cause: "provider",
      failure: run.failure,
      usage: meter("failed", { provider: run.provider, model: provider.model }),
    };
  }

  const usage = meter("succeeded", {
    provider: run.provider,
    model: run.model ?? provider.model,
    cost: costOf(run.inputTokens, run.outputTokens),
  });

  const parsed = parseWritingResponse(prompt, context, run.text);

  if (!parsed.ok) {
    return {
      ...base,
      status: "declined",
      cause: "response",
      problem: parsed.problem,
      /* The provider did the work and may have billed for it, so the record keeps its
       * attribution — but the user gets nothing, so the outcome is a failure and
       * `chargeableUnits` will not count it against their allowance. */
      usage: { ...usage, outcome: "failed" },
    };
  }

  /*
   * The review runs over whatever language came back, when there is any.
   *
   * The guard is not defensive padding. A consistency review of a document with nothing wrong
   * with it answers `findings: []`, which the parser accepts as the correct answer to that
   * question — and reviewing an empty collection would flag it as `empty` and decline the one
   * outcome the user most wants to hear. Every shape where absence is genuinely a failure is
   * refused earlier, by the parser, where the shape is known.
   */
  const language = hasGeneratedText(parsed.output.kind) ? generatedText(parsed.output) : [];

  if (language.length > 0) {
    const review = reviewOutput(context, language, { markers: promptMarkers });

    if (!review.acceptable) {
      return {
        ...base,
        status: "declined",
        cause: "review",
        findings: review.findings,
        usage: { ...usage, outcome: "failed" },
      };
    }
  }

  return {
    ...base,
    status: "written",
    output: parsed.output,
    fingerprint: requestFingerprint(prompt.id, request),
    missing: parsed.output.missing,
    usage,
  };
}

/**
 * A one-line, content-free description of an outcome, for a server log.
 *
 * Content-free is the requirement: security logging must not carry private document contents,
 * and a log line quoting the sentence that failed review would do exactly that. The finding
 * *kinds* are enough to see a pattern — a provider that keeps inventing percentages shows up
 * as a run of `unsupported_number` — without storing a word of anyone's career history.
 */
export function describeOutcome(outcome: WritingOutcome): string {
  const prefix = `${outcome.promptId} ${outcome.status}`;

  if (outcome.status === "written") return prefix;
  if (outcome.status === "insufficient") return `${prefix}: missing ${outcome.missing.join(", ")}`;
  if (outcome.cause === "provider") return `${prefix}: provider ${outcome.failure}`;
  if (outcome.cause === "response") return `${prefix}: response ${outcome.problem}`;

  return `${prefix}: review ${[...new Set(outcome.findings.map((f) => f.kind))].join(", ")}`;
}
