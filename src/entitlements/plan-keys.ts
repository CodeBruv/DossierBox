/**
 * Plan identity, on its own, so anything can name a plan without importing billing.
 *
 * The document catalogue needs to say "this document type requires Plus" and the
 * entitlement engine needs to say "this subscription is on Plus". If both imported a
 * single billing module the catalogue would depend on subscription evaluation, which
 * it has no business knowing about. So the *names* live here and the *meaning* lives
 * in `plans.ts`.
 *
 * The order is significant: plans are ranked, and `planRank` is what lets an access
 * check ask "is the user's plan at least this one?" instead of enumerating plans at
 * every call site. Rule 13 of the engineering rules — never scatter
 * `if (plan === "pro")` — is only keepable if comparison is cheap.
 */

export const planKeys = ["basic", "plus", "professional"] as const;

export type PlanKey = (typeof planKeys)[number];

/**
 * Where each plan sits in the hierarchy. Higher includes lower.
 *
 * Deliberately not the array index: an index would silently change meaning if a plan
 * were ever inserted in the middle, and these numbers are compared, not iterated.
 * Gaps are intentional so a plan can be added between two existing ones without
 * renumbering the others.
 */
const planRanks: Readonly<Record<PlanKey, number>> = {
  basic: 0,
  plus: 100,
  professional: 200,
};

export function planRank(plan: PlanKey): number {
  return planRanks[plan];
}

/**
 * Whether `plan` satisfies a `required` minimum.
 *
 * The single comparison every gate should use. Note what it is *not*: it is not an
 * entitlement check. It answers a question about plan ranking only. Whether a user
 * currently *has* that plan — subscription live, not expired, not past due — is
 * `src/entitlements/entitlements.ts`, and that is the one that gates access.
 */
export function planSatisfies(plan: PlanKey, required: PlanKey): boolean {
  return planRank(plan) >= planRank(required);
}

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === "string" && (planKeys as readonly string[]).includes(value);
}

/** The plan a user has when they have no subscription, and the one expiry falls back to. */
export const defaultPlanKey: PlanKey = "basic";
