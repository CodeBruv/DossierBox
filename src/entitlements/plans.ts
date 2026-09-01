/**
 * The plan catalogue — what each plan actually grants.
 *
 * `plan-keys.ts` holds the names and the ranking; this holds the meaning. The split is what
 * lets the document catalogue say "this type requires Plus" without importing anything that
 * knows about subscriptions or money.
 *
 * ## There are no prices here, deliberately
 *
 * The spec requires that pricing be configuration-driven, that it not be hard-coded into
 * components, that it be finalised separately before launch, and that currency follow the
 * customer's locale while the server stays authoritative for the amount actually charged.
 * None of that is satisfied by a number in this file. A price is a *provider* fact — it has
 * a currency, a tax treatment, a provider-side identifier, and a different value per market —
 * so it belongs with the payment layer, keyed by these plan keys. What belongs here is the
 * part that is true regardless of what anyone pays: which capabilities and how much of each
 * quota a plan includes.
 *
 * The consequence to keep in mind: nothing in this module can answer "how much is Plus?".
 * That is correct, and a pricing page will read the answer from the payment configuration.
 *
 * ## Why the numbers are in a table and not in the gates
 *
 * The rule is that no gate anywhere contains a quota figure. Every check goes through
 * `entitlementFor` and the arithmetic in `quotas.ts`, so these numbers appear exactly once.
 * Moving them to a database or an environment override later changes this file and no call
 * site, which is the property that makes them configurable rather than merely centralised.
 */

import { capabilities, type CapabilityKey } from "./capabilities";
import { planKeys, planRank, type PlanKey } from "./plan-keys";
import {
  allowanceExceeds,
  limited,
  unlimited,
  type Allowance,
  type QuotaKey,
} from "./quotas";

export type PlanDefinition = {
  key: PlanKey;
  /**
   * The plan's name in the product.
   *
   * Separate from the key on purpose: the key is a stable internal identifier that appears in
   * stored rows and in `minPlan` declarations, and the label is marketing copy that will
   * change. Renaming "Starter" must not require a data migration.
   */
  label: string;
  /** One line on who the plan is for. Not a feature list — that is derived below. */
  tagline: string;
  /**
   * Everything this plan grants outright.
   *
   * Stated in full rather than "everything below plus these", so a definition can be read on
   * its own. That the list is cumulative up the ranking is an invariant, asserted in
   * `entitlements.test.ts` rather than produced by inheritance, because inheritance would
   * make removing a capability from the top plan silently remove it from nothing.
   */
  capabilities: readonly CapabilityKey[];
  quotas: Readonly<Record<QuotaKey, Allowance>>;
};

/**
 * The shipped plans.
 *
 * Quota figures are chosen against the workload weights in `usage.ts`: a complete first pass
 * over one document — choosing relevant experience, restating a few achievements, then
 * tailoring the whole thing — is about ten units. The Basic allowance is therefore three
 * passes rather than one, because the spec requires the free tier to be genuinely useful and
 * a single non-repeatable attempt is a demonstration, not a document. That relationship is
 * asserted in the tests so the number cannot be trimmed without the claim failing.
 */
export const planRegistry: Readonly<Record<PlanKey, PlanDefinition>> = {
  basic: {
    key: "basic",
    label: "Free",
    tagline: "One complete, properly typeset document from your career profile.",
    capabilities: [],
    quotas: {
      stored_documents: limited(1),
      writing_units: limited(30),
      opportunity_interpretations: limited(0),
    },
  },
  plus: {
    key: "plus",
    label: "Starter",
    tagline: "The full set of documents an application needs, from one profile.",
    capabilities: ["document_set_generation", "opportunity_interpretation"],
    quotas: {
      stored_documents: limited(10),
      writing_units: limited(150),
      opportunity_interpretations: limited(10),
    },
  },
  professional: {
    key: "professional",
    label: "Pro",
    tagline: "Documents tailored to the specific opportunity you are applying for.",
    capabilities: [
      "document_set_generation",
      "objective_tailoring",
      "document_rewrite",
      "advanced_writing_assistance",
      "opportunity_interpretation",
    ],
    quotas: {
      stored_documents: unlimited,
      writing_units: limited(600),
      opportunity_interpretations: limited(30),
    },
  },
};

/**
 * The plans in the order they should be presented, cheapest first.
 *
 * Sorted by `planRank` rather than by the order they are declared above, so a plan inserted
 * between two existing ones appears in the right place on a pricing page without anyone
 * having to remember to move it.
 */
export const planList: readonly PlanDefinition[] = [...planKeys]
  .sort((a, b) => planRank(a) - planRank(b))
  .map((key) => planRegistry[key]);

export function planDefinition(plan: PlanKey): PlanDefinition {
  return planRegistry[plan];
}

export function planLabel(plan: PlanKey): string {
  return planRegistry[plan].label;
}

export function planQuota(plan: PlanKey, quota: QuotaKey): Allowance {
  return planRegistry[plan].quotas[quota];
}

/**
 * What a plan adds that the plan below it does not have.
 *
 * For the one place a comparison table is honest: repeating "complete application sets" on
 * every paid tier tells a reader nothing about the difference between them. Derived from the
 * ranking so it stays right when a plan is added.
 */
export function capabilitiesAddedBy(plan: PlanKey): readonly CapabilityKey[] {
  const rank = planRank(plan);
  const beneath = planList.filter((candidate) => planRank(candidate.key) < rank);
  const alreadyGranted = new Set(beneath.flatMap((candidate) => candidate.capabilities));

  return planRegistry[plan].capabilities.filter((key) => !alreadyGranted.has(key));
}

/**
 * The cheapest plan that includes a capability, or `null` if none does.
 *
 * What an upgrade prompt needs: a user who is refused something should be told the one plan
 * that would grant it, not handed a pricing page to work it out. Searching the ranking rather
 * than declaring the answer means the prompt follows a capability that moves between plans.
 */
export function cheapestPlanWith(capability: CapabilityKey): PlanKey | null {
  return planList.find((plan) => plan.capabilities.includes(capability))?.key ?? null;
}

/** The capability descriptors a plan grants, in the catalogue's declared order. */
export function planCapabilityDescriptors(plan: PlanKey) {
  return planRegistry[plan].capabilities.map((key) => capabilities[key]);
}

/**
 * The cheapest plan that allows more of a quota than `allowance` does, or `null` if none.
 *
 * The quota equivalent of `cheapestPlanWith`, and needed for the same reason: a user stopped
 * by a ceiling has to be pointed at the plan that raises it, and the only other way to write
 * that message is to name a plan in it.
 */
export function cheapestPlanExceeding(quota: QuotaKey, allowance: Allowance): PlanKey | null {
  return planList.find((plan) => allowanceExceeds(plan.quotas[quota], allowance))?.key ?? null;
}

