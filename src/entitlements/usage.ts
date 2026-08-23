/**
 * Usage — what a piece of writing work costs, and what is recorded about it.
 *
 * The brief is explicit that usage must not be `generationCount++`, and the reason is
 * arithmetic rather than taste: rewording one achievement line and aligning every document
 * in an application set are both "one generation" and differ by roughly an order of
 * magnitude in work. Counting requests therefore either bills the careful user for the
 * expensive operation or gives the expensive operation away.
 *
 * So each kind of work carries a declared weight, and a plan's allowance is denominated in
 * those weights. The weights are integers so that every comparison in `quotas.ts` is exact.
 *
 * ## The weights are estimates, and are labelled as such
 *
 * Nothing has measured them. They are ratios chosen from the shape of each operation — how
 * much of the dossier goes in, how much prose comes out — and they exist so the *structure*
 * is right before there is anything to measure. When a provider is wired up in the next
 * phase, real token counts land in `providerCost` on each record, and these weights get
 * corrected against them. That correction changes one table here and nothing else, which is
 * the point of denominating plans in units rather than in requests.
 *
 * ## What a usage record must never contain
 *
 * No prompt, no dossier content, no generated prose. Metering needs to know that a résumé
 * tailoring happened, for whom, how large it was and whether it worked. It does not need the
 * user's career history a second time, and the spec forbids putting it there. The fields
 * below are deliberately all identifiers, sizes and outcomes.
 */

import type { PlanKey } from "./plan-keys";

/**
 * Every kind of writing work the product performs.
 *
 * These are the names the prompt library will be keyed by in the next phase, so that a
 * prompt, its weight and its usage records all refer to the same thing rather than to three
 * parallel vocabularies that drift.
 */
export const workloadKinds = [
  "achievement_reframing",
  "experience_relevance_matching",
  "document_consistency_review",
  "cover_letter_generation",
  "resume_tailoring",
  "motivation_letter_generation",
  "personal_statement_generation",
  "academic_statement_generation",
  "application_set_alignment",
] as const;

export type WorkloadKind = (typeof workloadKinds)[number];

export type WorkloadDescriptor = {
  kind: WorkloadKind;
  /** What the work is, in the product's own terms. Never shown as "an AI call". */
  label: string;
  /**
   * The estimated cost in abstract units. Integral, and relative to the others only.
   *
   * One unit is roughly the smallest useful piece of work: restating a single achievement.
   */
  units: number;
};

/**
 * Ordered cheapest first, because that is the order in which the numbers have to be
 * defensible: each step up should be readable as "about this much more work than the last".
 */
const workloadDescriptors: Readonly<Record<WorkloadKind, WorkloadDescriptor>> = {
  /** One line in, one line out. The unit everything else is measured against. */
  achievement_reframing: { kind: "achievement_reframing", label: "Restating an achievement", units: 1 },
  /** The dossier in, a ranked selection out: large input, small output. */
  experience_relevance_matching: {
    kind: "experience_relevance_matching",
    label: "Choosing which experience is relevant",
    units: 2,
  },
  /** Several finished documents in, notes out. */
  document_consistency_review: {
    kind: "document_consistency_review",
    label: "Checking documents against each other",
    units: 3,
  },
  /** A page of prose from recorded facts. */
  cover_letter_generation: {
    kind: "cover_letter_generation",
    label: "Writing a cover letter",
    units: 4,
  },
  /** Every section of an existing document reworked for one opportunity. */
  resume_tailoring: { kind: "resume_tailoring", label: "Tailoring a résumé", units: 5 },
  motivation_letter_generation: {
    kind: "motivation_letter_generation",
    label: "Writing a motivation letter",
    units: 5,
  },
  /** Longer than a letter, and has to hold a narrative rather than a request. */
  personal_statement_generation: {
    kind: "personal_statement_generation",
    label: "Writing a personal statement",
    units: 6,
  },
  academic_statement_generation: {
    kind: "academic_statement_generation",
    label: "Writing an academic statement",
    units: 6,
  },
  /** Several documents in and edits to several documents out: the largest single operation. */
  application_set_alignment: {
    kind: "application_set_alignment",
    label: "Aligning a complete application",
    units: 8,
  },
};

export const workloadList: readonly WorkloadDescriptor[] = workloadKinds.map(
  (kind) => workloadDescriptors[kind],
);

/** `in` walks the prototype chain; a workload name can arrive from a stored record. */
const workloadKindSet: ReadonlySet<string> = new Set(workloadKinds);

export function isWorkloadKind(value: unknown): value is WorkloadKind {
  return typeof value === "string" && workloadKindSet.has(value);
}

export function workloadUnits(kind: WorkloadKind): number {
  return workloadDescriptors[kind].units;
}

/** What a batch of work will cost, for a quota check made *before* any of it runs. */
export function estimatedUnits(kinds: readonly WorkloadKind[]): number {
  return kinds.reduce((total, kind) => total + workloadUnits(kind), 0);
}

export type UsageOutcome = "succeeded" | "failed";

/**
 * What a provider reported, when one ran.
 *
 * Optional throughout because a deterministic fallback produces a document without a
 * provider at all, and because a provider that times out reports nothing. `amountMinor` is
 * in minor currency units — integer cents — so no cost is ever held as a float.
 */
export type ProviderCost = {
  inputTokens?: number;
  outputTokens?: number;
  currency?: string;
  amountMinor?: number;
};

/**
 * One piece of work, after the fact.
 *
 * `plan` records the entitlement the work was performed *under*, not the user's plan now.
 * Without it, a month of records becomes unreadable the moment someone upgrades: there is
 * no way to tell which allowance a given operation was drawn from, and therefore no way to
 * audit a quota dispute.
 */
export type UsageRecord = {
  userId: string;
  workload: WorkloadKind;
  outcome: UsageOutcome;
  /** What the quota was checked against beforehand. */
  estimatedUnits: number;
  /** What is actually drawn from the allowance. See `chargeableUnits`. */
  units: number;
  plan: PlanKey;
  /** Never shown to a user: naming the provider or model is the spec's own prohibition. */
  provider: string | null;
  model: string | null;
  providerCost: ProviderCost | null;
  occurredAt: Date;
  /** What the work was for, so a record can be traced without storing its content. */
  documentId: string | null;
  applicationId: string | null;
};

/**
 * What a completed piece of work draws from the user's allowance.
 *
 * Zero when it failed. A user who asked for help and did not receive it must not have paid
 * for it — that is the difference between a quota and a toll. The record is still kept,
 * because a provider may well have billed *us* for the failure and observability needs to
 * see it.
 *
 * This deliberately leaves an asymmetry: repeated failures cost the business without costing
 * the user, so failures have to be bounded by rate limiting rather than by quota. That is a
 * separate mechanism in the spec and belongs at the request boundary, not here.
 */
export function chargeableUnits(record: Pick<UsageRecord, "outcome" | "units">): number {
  return record.outcome === "succeeded" ? record.units : 0;
}

/** What a set of records has drawn in total — the `consumed` figure a quota check needs. */
export function consumedUnits(records: readonly Pick<UsageRecord, "outcome" | "units">[]): number {
  return records.reduce((total, record) => total + chargeableUnits(record), 0);
}
