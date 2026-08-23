/**
 * Subscription state, and the one question that matters: which plan is in force *now*.
 *
 * This module is pure. It takes a subscription record and a moment, and returns a plan. It
 * reads no clock, touches no database and knows nothing about providers beyond keeping two
 * opaque identifier fields for them.
 *
 * ## Why the current time is a parameter
 *
 * Because expiry is the one piece of business logic that cannot be tested if it reads the
 * clock itself, and expiry is exactly where money leaks. A function that calls `Date.now()`
 * internally can only be tested by waiting. Passing the moment in also means one request
 * evaluates every check against a single instant, so a user cannot be entitled at the top of
 * a page and unentitled at the bottom.
 *
 * ## Status alone is not trusted, and neither are dates alone
 *
 * A subscription row says `active` because a provider webhook said so. Webhooks get missed,
 * retried out of order, and dropped when an endpoint is briefly down. A row that still reads
 * `active` with a period that ended two months ago is therefore an ordinary occurrence, and
 * trusting the status would hand out premium access indefinitely — the precise failure the
 * requirements call out: premium access must end.
 *
 * The reverse is just as real: a renewal that arrives an hour late would cut off a paying
 * customer at midnight if the period end were treated as a hard edge. So there is a grace
 * window, applied uniformly to the period end rather than attached to one status, because a
 * late renewal and a failed payment retry are the same situation from the customer's side.
 *
 * The rule is therefore: **a status that grants access, and a period that has not ended,
 * within grace.** Both. And where the record cannot answer — an access-granting status with
 * no period end at all — this fails closed to the free plan. An entitlement check that
 * guesses in the customer's favour when its own data is incoherent is a check that can be
 * made to guess.
 *
 * ## What expiry does not do
 *
 * It does not touch the user's work. The spec is unambiguous: an expired subscription keeps
 * the account, the profile, existing documents, previous versions and existing PDFs. This
 * module downgrades a *plan*; nothing here deletes anything, and nothing that consumes it
 * should either.
 */

import { defaultPlanKey, type PlanKey } from "./plan-keys";

/**
 * Our own vocabulary, not any provider's.
 *
 * Stripe and Paystack disagree on names and on how many states there are, and the payment
 * layer's job will be to map each of them onto these. Keeping the domain vocabulary small is
 * what makes that mapping a decision someone has to write down rather than a passthrough.
 */
export const subscriptionStatuses = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
] as const;

export type SubscriptionStatus = (typeof subscriptionStatuses)[number];

/** `in` walks the prototype chain; a status arrives from a database column. */
const subscriptionStatusSet: ReadonlySet<string> = new Set(subscriptionStatuses);

export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === "string" && subscriptionStatusSet.has(value);
}

/**
 * Whether a status permits access at all, before any date is considered.
 *
 * Only `expired` denies outright, and that is deliberate: it is the terminal marker a webhook
 * sets to revoke access immediately — a refund, a chargeback, a fraud hold — without waiting
 * for a period to run out. Every other status defers to the period end, which is where the
 * real decision is made.
 *
 * `canceled` grants access because cancelling ends the *renewal*, not the period already paid
 * for. Taking access away the moment someone cancels would be charging for time and then not
 * providing it.
 */
function statusGrantsAccess(status: SubscriptionStatus): boolean {
  return status !== "expired";
}

/**
 * How long access outlives the paid period.
 *
 * Three days covers a failed card being retried and a webhook backlog being drained, and is
 * short enough that it cannot be used as a free extra month. Declared here, in one place, so
 * it can be moved to configuration without touching a call site.
 */
export const defaultGraceWindowDays = 3;

const dayInMilliseconds = 24 * 60 * 60 * 1000;

/**
 * A subscription as this product understands it.
 *
 * `provider` and `providerSubscriptionId` are held so a record can be reconciled against the
 * provider that created it, and are never sent to a browser: the spec forbids exposing
 * provider details, and a subscription identifier is enough to attempt support-desk fraud.
 */
export type Subscription = {
  plan: PlanKey;
  status: SubscriptionStatus;
  /**
   * The end of the period the customer has paid for.
   *
   * Nullable because the column will be, and because a record can arrive incomplete. It is
   * not an "unlimited" signal — see the fail-closed note in the module comment.
   */
  currentPeriodEnd: Date | null;
  /** Set when the customer has cancelled but the paid period is still running. */
  cancelAtPeriodEnd: boolean;
  provider: string | null;
  providerSubscriptionId: string | null;
};

export type EffectivePlanOptions = {
  /** Overridable so a test can drive the boundary, and so configuration can move it. */
  graceWindowDays?: number;
};

/**
 * The moment access actually stops, grace included.
 *
 * `null` when the record cannot say — which callers must read as "unknown", never as "never".
 */
export function accessEndsAt(
  subscription: Subscription,
  { graceWindowDays = defaultGraceWindowDays }: EffectivePlanOptions = {},
): Date | null {
  if (subscription.currentPeriodEnd === null) return null;

  return new Date(subscription.currentPeriodEnd.getTime() + graceWindowDays * dayInMilliseconds);
}

/**
 * Whether this subscription is in force at `now`.
 *
 * Both conditions, and an unknown end date fails closed.
 */
export function subscriptionIsCurrent(
  subscription: Subscription,
  now: Date,
  options: EffectivePlanOptions = {},
): boolean {
  if (!statusGrantsAccess(subscription.status)) return false;

  const endsAt = accessEndsAt(subscription, options);
  if (endsAt === null) return false;

  return now.getTime() < endsAt.getTime();
}

/**
 * The plan in force at `now` — the only function that should decide what a user is on.
 *
 * `null` for a user who has never subscribed, which is the common case and not an error: they
 * are on the free plan, and the free plan is a real product rather than an absence.
 */
export function effectivePlan(
  subscription: Subscription | null,
  now: Date,
  options: EffectivePlanOptions = {},
): PlanKey {
  if (subscription === null) return defaultPlanKey;

  return subscriptionIsCurrent(subscription, now, options) ? subscription.plan : defaultPlanKey;
}

/**
 * Everything an account screen needs to explain the subscription to its owner.
 *
 * One function rather than several, because the interesting states are combinations: paid and
 * renewing, paid but cancelling at the end of the period, paid but a payment has failed, and
 * lapsed. Deriving those separately in a component is how three screens end up disagreeing
 * about whether someone is still a customer.
 */
export type SubscriptionStanding = {
  /** What was purchased. Retained even once it no longer grants anything. */
  purchasedPlan: PlanKey;
  /** What is actually in force now. */
  plan: PlanKey;
  status: SubscriptionStatus;
  /** True when a paid plan was purchased and is no longer in force. */
  lapsed: boolean;
  /** True when the paid period has ended and only the grace window is holding access open. */
  inGrace: boolean;
  /** When access stops, if that is known. */
  endsAt: Date | null;
  /** True when access is running out and will not renew itself. */
  willNotRenew: boolean;
};

export function describeStanding(
  subscription: Subscription | null,
  now: Date,
  options: EffectivePlanOptions = {},
): SubscriptionStanding {
  if (subscription === null) {
    return {
      purchasedPlan: defaultPlanKey,
      plan: defaultPlanKey,
      status: "expired",
      lapsed: false,
      inGrace: false,
      endsAt: null,
      willNotRenew: false,
    };
  }

  const current = subscriptionIsCurrent(subscription, now, options);
  const periodEnd = subscription.currentPeriodEnd;
  const pastPeriodEnd = periodEnd !== null && now.getTime() >= periodEnd.getTime();

  return {
    purchasedPlan: subscription.plan,
    plan: current ? subscription.plan : defaultPlanKey,
    status: subscription.status,
    /* Not "is on the free plan": someone who never paid has not lapsed. */
    lapsed: !current && subscription.plan !== defaultPlanKey,
    inGrace: current && pastPeriodEnd,
    endsAt: accessEndsAt(subscription, options),
    willNotRenew: current && (subscription.cancelAtPeriodEnd || subscription.status === "canceled"),
  };
}
