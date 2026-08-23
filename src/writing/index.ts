/**
 * The writing layer — the internal assistant that improves language and invents nothing.
 *
 * The AI is not the product. The specification is emphatic about it: no chat interface, no
 * prompt box, no model names, no "AI generated this". A user sees a better document. This
 * module is what makes it better, and its entire public surface is one function that takes
 * facts and returns either language or a reason there is none.
 *
 * ## The dependency direction
 *
 * `writing` imports `entitlements` — for the workload vocabulary and the usage record — and
 * imports nothing else in the application. Not the document catalogue, not the dossier, not
 * `applications`. A caller that holds all three extracts what is relevant and passes it in,
 * which keeps the *selection* of facts an engine decision rather than an implicit behaviour of
 * a prompt, and keeps this layer testable without standing up half the product.
 *
 * ## What is here and what is not
 *
 * Present: the structured context and its limits, the versioned prompt library, the response
 * parser, the fabrication check, the provider interface with its retry and timeout policy, and
 * the orchestration that runs them in the required order.
 *
 * Absent, deliberately, and each for a stated reason:
 *
 * - **A real provider.** {@link unavailableProvider} is the default and fails every request,
 *   which means the fallback path is the one that runs today and is therefore exercised rather
 *   than merely written. Wiring a model is the next phase's work.
 * - **Persistence.** No table for prompts, generations or usage. A schema shaped before a
 *   provider exists would be shaped around a guess; {@link requestWriting} returns a complete
 *   usage record for whatever eventually stores one.
 * - **Rate limiting.** Required at the request boundary, and this module has no request
 *   boundary yet — nothing calls it from a route. It belongs with the server action that will.
 * - **`server-only`.** Nothing here reads a secret or touches a session, so the marker would
 *   buy no safety today and would cost the offline test harness the ability to load these
 *   files. It belongs on the concrete provider, which will hold a credential.
 */

export {
  buildWritingContext,
  contentMarker,
  defaultWritingConstraints,
  defaultWritingContextLimits,
  emptyWritingTarget,
  fence,
  renderWritingContext,
  supportingText,
} from "./context";
export type {
  SectionRequirement,
  WritingConstraints,
  WritingContext,
  WritingContextDraft,
  WritingContextLimits,
  WritingDraft,
  WritingFact,
  WritingPurpose,
  WritingTarget,
} from "./context";

export {
  isWritingFindingKind,
  neutralTerms,
  normaliseNumber,
  reviewOutput,
  unsupportedNames,
  unsupportedNumbers,
  writingFindingKinds,
} from "./integrity";
export type {
  ReviewOptions,
  WritingFinding,
  WritingFindingKind,
  WritingReview,
} from "./integrity";

/*
 * `promptLibrary`, `systemPrompt` and the instruction text are *not* re-exported.
 *
 * The specification forbids exposing internal prompts, and a barrel export is how something
 * ends up in a client bundle by accident: one component importing a label from `@/writing`
 * pulls the module in, and a later refactor turns a convenience into a leak. The orchestration
 * needs them and imports them directly; nothing else has any business with them.
 *
 * What is exported is the vocabulary a caller legitimately needs: the identifier recorded
 * against a generation, and the shape of what comes back.
 */
export { contextRequirements, promptId, writingOutputKinds } from "./prompts";
export type { ContextRequirement, WritingOutputKind } from "./prompts";

export { generatedText, hasGeneratedText, relevanceLevels, responseLimits } from "./response";
export type {
  Finding,
  RelevanceLevel,
  ResponseProblem,
  Revision,
  Selection,
  WritingOutput,
} from "./response";

export {
  defaultProviderLimits,
  isRetryable,
  providerFailures,
  requestFingerprint,
  unavailableProvider,
} from "./provider";
export type {
  ProviderFailure,
  ProviderLimits,
  ProviderRequest,
  ProviderResult,
  WritingProvider,
} from "./provider";

export { describeOutcome, requestWriting } from "./writing";
export type { WritingActor, WritingOptions, WritingOutcome } from "./writing";
