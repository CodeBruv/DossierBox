import { describe, expect, it } from "vitest";
import {
  accessEndsAt,
  defaultGraceWindowDays,
  describeStanding,
  effectivePlan,
  isSubscriptionStatus,
  subscriptionIsCurrent,
  subscriptionStatuses,
  type Subscription,
} from "./subscription";

/*
 * Expiry is the one piece of logic here that costs money when it is wrong, and it is wrong in
 * two opposite directions. Too lenient and a subscription that lapsed months ago still confers
 * a paid plan — the requirement that premium access must end, unmet. Too strict and a customer
 * whose renewal webhook is an hour late loses access they have paid for.
 *
 * So every test below is a boundary or a contradiction between the status and the dates. The
 * contradictions are not hypothetical: a missed, retried or out-of-order webhook leaves a row
 * saying `active` with a period that ended, and that row is what these assertions are about.
 */

const day = 24 * 60 * 60 * 1000;
const now = new Date("2026-06-15T12:00:00.000Z");
const at = (offsetDays: number) => new Date(now.getTime() + offsetDays * day);

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    plan: "professional",
    status: "active",
    currentPeriodEnd: at(10),
    cancelAtPeriodEnd: false,
    provider: "stripe",
    providerSubscriptionId: "sub_test",
    ...overrides,
  };
}

describe("which plan is in force", () => {
  it("gives the free plan to someone who has never subscribed", () => {
    expect(effectivePlan(null, now)).toBe("basic");
  });

  it("gives the purchased plan while the period is running", () => {
    expect(effectivePlan(subscription(), now)).toBe("professional");
    expect(effectivePlan(subscription({ plan: "plus" }), now)).toBe("plus");
  });

  /**
   * The revenue leak this module exists to close. The row still says `active` because the
   * webhook that would have said otherwise never arrived; the dates say the customer stopped
   * paying in April. Trusting the status here is indefinite free access to a paid plan.
   */
  it("downgrades a subscription whose period ended, whatever the status says", () => {
    for (const status of ["active", "trialing", "past_due", "canceled"] as const) {
      expect(
        effectivePlan(subscription({ status, currentPeriodEnd: at(-60) }), now),
        `a ${status} subscription two months past its period must not confer a paid plan`,
      ).toBe("basic");
    }
  });

  /** The other half: a terminal revocation must not wait for a period to run out. */
  it("downgrades an expired subscription even with time left on the period", () => {
    expect(effectivePlan(subscription({ status: "expired", currentPeriodEnd: at(30) }), now))
      .toBe("basic");
  });

  /**
   * Cancelling ends the renewal, not the period already paid for. Revoking access at the
   * moment someone cancels is charging for time and then not providing it.
   */
  it("keeps access for a cancelled subscription until its period ends", () => {
    const cancelled = subscription({ status: "canceled", cancelAtPeriodEnd: true });

    expect(effectivePlan(cancelled, now)).toBe("professional");
    expect(effectivePlan(cancelled, at(30))).toBe("basic");
  });

  it("keeps access through a failed payment while the grace window holds", () => {
    const failing = subscription({ status: "past_due", currentPeriodEnd: at(-1) });

    expect(effectivePlan(failing, now)).toBe("professional");
    expect(effectivePlan(failing, at(defaultGraceWindowDays))).toBe("basic");
  });

  /**
   * An access-granting status with no period end is incoherent data, not a licence. An
   * entitlement check that resolves its own missing data in the customer's favour is a check
   * that can be made to resolve that way on purpose.
   */
  it("fails closed when the record cannot say when the period ends", () => {
    expect(effectivePlan(subscription({ currentPeriodEnd: null }), now)).toBe("basic");
    expect(accessEndsAt(subscription({ currentPeriodEnd: null }))).toBeNull();
  });
});

describe("the boundary", () => {
  it("ends access at the last instant of the grace window, not after it", () => {
    const ending = subscription({ currentPeriodEnd: now });
    const endsAt = accessEndsAt(ending);

    expect(endsAt).toBeInstanceOf(Date);
    expect(endsAt?.getTime()).toBe(now.getTime() + defaultGraceWindowDays * day);

    /* One millisecond before: still a customer. Exactly on it: not. */
    expect(subscriptionIsCurrent(ending, new Date((endsAt?.getTime() ?? 0) - 1))).toBe(true);
    expect(subscriptionIsCurrent(ending, endsAt ?? now)).toBe(false);
  });

  it("takes the grace window from its argument, so configuration can move it", () => {
    const lapsed = subscription({ currentPeriodEnd: at(-5) });

    expect(effectivePlan(lapsed, now)).toBe("basic");
    expect(effectivePlan(lapsed, now, { graceWindowDays: 7 })).toBe("professional");
  });

  it("treats a zero grace window as a hard period end", () => {
    const ending = subscription({ currentPeriodEnd: now });

    expect(subscriptionIsCurrent(ending, now, { graceWindowDays: 0 })).toBe(false);
  });
});

describe("purity", () => {
  /**
   * The reason the moment is a parameter. If any of this read the clock, the assertions above
   * would pass or fail depending on the day they were run.
   */
  it("answers only from its arguments", () => {
    const record = subscription({ currentPeriodEnd: new Date("1999-01-01T00:00:00.000Z") });

    expect(effectivePlan(record, new Date("1998-01-01T00:00:00.000Z"))).toBe("professional");
    expect(effectivePlan(record, new Date("2099-01-01T00:00:00.000Z"))).toBe("basic");
  });

  it("does not alter the record it was given", () => {
    const record = subscription();
    const before = JSON.stringify(record);

    effectivePlan(record, now);
    describeStanding(record, now);
    accessEndsAt(record);

    expect(JSON.stringify(record)).toBe(before);
  });
});

describe("explaining the subscription to its owner", () => {
  it("says nothing has lapsed for someone who never paid", () => {
    const standing = describeStanding(null, now);

    expect(standing.plan).toBe("basic");
    expect(standing.purchasedPlan).toBe("basic");
    expect(standing.lapsed).toBe(false);
    expect(standing.willNotRenew).toBe(false);
    expect(standing.endsAt).toBeNull();
  });

  /** The distinction a downgrade notice depends on: what was bought versus what is in force. */
  it("keeps the purchased plan visible after it stops applying", () => {
    const standing = describeStanding(subscription({ currentPeriodEnd: at(-30) }), now);

    expect(standing.purchasedPlan).toBe("professional");
    expect(standing.plan).toBe("basic");
    expect(standing.lapsed).toBe(true);
  });

  it("reports the grace window as still being a customer", () => {
    const standing = describeStanding(
      subscription({ status: "past_due", currentPeriodEnd: at(-1) }),
      now,
    );

    expect(standing.plan).toBe("professional");
    expect(standing.inGrace).toBe(true);
    expect(standing.lapsed).toBe(false);
  });

  it("does not call a running period a grace window", () => {
    expect(describeStanding(subscription(), now).inGrace).toBe(false);
  });

  it("flags a subscription that is running out and will not renew", () => {
    expect(describeStanding(subscription({ cancelAtPeriodEnd: true }), now).willNotRenew).toBe(true);
    expect(describeStanding(subscription({ status: "canceled" }), now).willNotRenew).toBe(true);
    expect(describeStanding(subscription(), now).willNotRenew).toBe(false);
  });

  /** Nothing to renew once it has already lapsed; saying otherwise would read as a warning. */
  it("does not warn about renewal on a subscription that has already ended", () => {
    const ended = subscription({ cancelAtPeriodEnd: true, currentPeriodEnd: at(-30) });

    expect(describeStanding(ended, now).willNotRenew).toBe(false);
  });
});

describe("the status vocabulary", () => {
  it("accepts every declared status and nothing else", () => {
    for (const status of subscriptionStatuses) {
      expect(isSubscriptionStatus(status)).toBe(true);
    }

    expect(isSubscriptionStatus("paid")).toBe(false);
    expect(isSubscriptionStatus("Active")).toBe(false);
    expect(isSubscriptionStatus(null)).toBe(false);
    expect(isSubscriptionStatus(undefined)).toBe(false);
  });

  /** The document style guard shipped this bug once. A status arrives from a text column. */
  it("refuses an inherited property name", () => {
    expect(isSubscriptionStatus("constructor")).toBe(false);
    expect(isSubscriptionStatus("toString")).toBe(false);
    expect(isSubscriptionStatus("__proto__")).toBe(false);
  });

  /**
   * Every status has to be decidable, or a row in that state silently means whatever the last
   * branch happened to be. Checked by asserting each one resolves to a plan without throwing.
   */
  it("resolves a plan for every status", () => {
    for (const status of subscriptionStatuses) {
      const resolved = effectivePlan(subscription({ status }), now);

      expect(["basic", "plus", "professional"]).toContain(resolved);
    }
  });
});
