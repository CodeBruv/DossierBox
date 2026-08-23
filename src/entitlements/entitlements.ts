/**
 * Entitlement — what this user may do, right now.
 *
 * The one module a server-side gate should consult, and the reason the rest of this directory
 * is split the way it is. `plan-keys.ts` names plans, `plans.ts` says what each grants,
 * `subscription.ts` says which one is in force, `quotas.ts` does the arithmetic. This joins
 * them into a single value and offers three questions to ask of it.
 *
 * ## What it deliberately does not know about
 *
 * **Documents.** Nothing here imports the document catalogue, and that is a load-bearing
 * absence: the catalogue already imports `plan-keys` in order to declare `minPlan` on a
 * document type, so an import in this direction would close a loop between "what a document
 * is" and "who may have one". Instead a document type *states* its requirement and the caller
 * joins the two:
 *
 * ```ts
 * requirePlan(entitlement, documentTypeMinPlan(type))
 * ```
 *
 * The caller is a server action or a route handler — a place that already knows both.
 *
 * **Usage.** An entitlement says what the ceiling is, not how much of it is gone. Consumption
 * is passed to `requireQuota` by whoever asked, because most checks do not need it and forcing
 * a usage query into every entitlement lookup would put a database round trip behind questions
 * like "may this account tailor a document at all".
 *
 * ## Why decisions are values rather than exceptions
 *
 * A refusal has to be *explained* — the plan that would grant the thing, how much allowance is
 * left — and a thrown error is a poor carrier for that. It also has to be *reportable*: the
 * analytics events in the spec include upgrade prompts being shown, which means a denial is a
 * product event and not only a failure. So gates return a decision, and the caller decides
 * whether that becomes a redirect, a disabled control with an explanation, or an error.
 *
 * The reason is a code, not a sentence. Copy belongs to the interface that shows it, mapped
 * from a fixed set exactly as the document page already maps its error codes — so no message
 * is ever assembled from something a browser sent.
 */

import { capabilityList, type CapabilityKey } from "./capabilities";
import { planSatisfies, type PlanKey } from "./plan-keys";
import { cheapestPlanExceeding, cheapestPlanWith, planLabel, planRegistry } from "./plans";
import {
  allowanceLimit,
  allowancePermits,
  allowanceRemaining,
  quotaKeys,
  type Allowance,
  type QuotaKey,
} from "./quotas";
import {
  describeStanding,
  type EffectivePlanOptions,
  type Subscription,
  type SubscriptionStanding,
} from "./subscription";

/**
 * A user's capabilities at one instant.
 *
 * Built once per request and passed down, rather than recomputed at each gate: every check in
 * a request then answers against the same plan and the same moment, so a page cannot render a
 * control that its own submit handler refuses.
 */
export type Entitlement = {
  /** The plan in force — already resolved through expiry. Never the purchased plan. */
  plan: PlanKey;
  /** The full subscription picture, for screens that have to explain it. */
  standing: SubscriptionStanding;
  /** A set rather than an array: this is asked repeatedly and never iterated in a gate. */
  capabilities: ReadonlySet<CapabilityKey>;
  quotas: Readonly<Record<QuotaKey, Allowance>>;
  /** The instant this was evaluated at, so a decision made from it can be traced. */
  evaluatedAt: Date;
};

/**
 * The entitlement a subscription produces at `now`.
 *
 * `null` for a user who has never paid, which is the ordinary case: they get the free plan's
 * entitlement, which is a real one.
 */
export function entitlementFor(
  subscription: Subscription | null,
  now: Date,
  options: EffectivePlanOptions = {},
): Entitlement {
  const standing = describeStanding(subscription, now, options);
  const definition = planRegistry[standing.plan];

  return {
    plan: standing.plan,
    standing,
    capabilities: new Set(definition.capabilities),
    quotas: definition.quotas,
    evaluatedAt: now,
  };
}

/**
 * The free plan's entitlement.
 *
 * Named separately so a caller that has established there is no subscription does not have to
 * pass `null` and hope this module treats it as free. Also the correct thing to fall back to
 * when a subscription *cannot be read*: a database failure must not silently confer a paid
 * plan, and must not lock a user out of the free product either.
 */
export function freeEntitlement(now: Date): Entitlement {
  return entitlementFor(null, now);
}

export function hasCapability(entitlement: Entitlement, capability: CapabilityKey): boolean {
  return entitlement.capabilities.has(capability);
}

/**
 * Whether the entitlement meets a plan requirement stated elsewhere.
 *
 * The bridge to `minPlan` declarations in the document catalogue, and the only place a plan
 * comparison should appear outside `plan-keys.ts`.
 */
export function satisfiesPlan(entitlement: Entitlement, required: PlanKey): boolean {
  return planSatisfies(entitlement.plan, required);
}

export function allowanceFor(entitlement: Entitlement, quota: QuotaKey): Allowance {
  return entitlement.quotas[quota];
}

export const denialReasons = [
  "capability_not_included",
  "plan_too_low",
  "quota_exhausted",
] as const;

export type DenialReason = (typeof denialReasons)[number];

/**
 * The answer to one gate.
 *
 * A discriminated union so a caller cannot read `reason` without having checked `allowed` —
 * the shape that stops a refusal being accidentally ignored, which is the failure mode of
 * returning a bare boolean alongside an out-parameter.
 */
export type AccessDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason: DenialReason;
      /** The cheapest plan that would allow it, or `null` when no plan would. */
      readonly requiredPlan: PlanKey | null;
      /** The ceiling that was hit, when the refusal was a quota. For the message only. */
      readonly limit?: number | null;
      readonly remaining?: number | null;
    };

const allowed: AccessDecision = { allowed: true };

/** Whether this entitlement includes a capability, with the upgrade path if it does not. */
export function requireCapability(
  entitlement: Entitlement,
  capability: CapabilityKey,
): AccessDecision {
  if (hasCapability(entitlement, capability)) return allowed;

  return {
    allowed: false,
    reason: "capability_not_included",
    requiredPlan: cheapestPlanWith(capability),
  };
}

/**
 * Whether this entitlement meets a plan floor.
 *
 * `requiredPlan` is the floor itself: nothing cheaper satisfies it by definition, so there is
 * no search to do.
 */
export function requirePlan(entitlement: Entitlement, required: PlanKey): AccessDecision {
  if (satisfiesPlan(entitlement, required)) return allowed;

  return { allowed: false, reason: "plan_too_low", requiredPlan: required };
}

/**
 * Whether `requested` more of a quota is within this entitlement, given what is already used.
 *
 * `consumed` is supplied by the caller because it comes from metering, which this module does
 * not read. A caller that passes a stale figure grants slightly too much, which is why the
 * count should be read in the same transaction as the operation it guards once persistence
 * exists.
 */
export function requireQuota(
  entitlement: Entitlement,
  quota: QuotaKey,
  consumed: number,
  requested = 1,
): AccessDecision {
  const allowance = allowanceFor(entitlement, quota);
  if (allowancePermits(allowance, consumed, requested)) return allowed;

  return {
    allowed: false,
    reason: "quota_exhausted",
    requiredPlan: cheapestPlanExceeding(quota, allowance),
    limit: allowanceLimit(allowance),
    remaining: allowanceRemaining(allowance, consumed),
  };
}

/**
 * Every gate together, for a screen rather than an operation.
 *
 * A dashboard needs to know what is and is not available before the user picks anything, and
 * the alternative is a component calling each gate itself — which is how a list of plan checks
 * ends up in the browser. This keeps the evaluation server-side and sends only the answers.
 *
 * Note what crosses the boundary if this is serialised: three booleans and a plan name. No
 * quota figures a user has not hit, no provider details, no subscription identifier.
 */
export type EntitlementSummary = {
  plan: PlanKey;
  planLabel: string;
  capabilities: readonly { key: CapabilityKey; label: string; included: boolean }[];
  quotas: readonly { key: QuotaKey; limit: number | null }[];
};

export function summarise(entitlement: Entitlement): EntitlementSummary {
  return {
    plan: entitlement.plan,
    planLabel: planLabel(entitlement.plan),
    /* `capabilityList`, not `Object.values`: the declared order is the order a comparison
     * table should read in, and object property order is not something to rely on for it. */
    capabilities: capabilityList.map((capability) => ({
      key: capability.key,
      label: capability.label,
      included: hasCapability(entitlement, capability.key),
    })),
    /* Read back from the entitlement rather than from the plan. They agree today, but a
     * per-account grant — a support adjustment, a promotion — would live on the entitlement,
     * and a summary that consulted the plan instead would report the wrong ceiling. */
    quotas: quotaKeys.map((key) => ({
      key,
      limit: allowanceLimit(allowanceFor(entitlement, key)),
    })),
  };
}
