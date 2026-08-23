import { describe, expect, it } from "vitest";
import {
  defaultPlanKey,
  isPlanKey,
  planKeys,
  planRank,
  planSatisfies,
  type PlanKey,
} from "./plan-keys";

/*
 * Plan ranking is the mechanism that keeps `if (plan === "pro")` out of the codebase, so
 * it has to be right before anything depends on it. These are ordering tests, not access
 * tests: whether a user currently *has* a plan is the entitlement evaluator's job.
 */

describe("plan ranking", () => {
  it("ranks every plan distinctly", () => {
    const ranks = planKeys.map(planRank);

    expect(new Set(ranks).size, "two plans must not share a rank").toBe(ranks.length);
  });

  it("ranks the plans in the order they are declared", () => {
    const ranks = planKeys.map(planRank);

    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("leaves room to insert a plan without renumbering", () => {
    for (let index = 1; index < planKeys.length; index += 1) {
      const gap = planRank(planKeys[index]!) - planRank(planKeys[index - 1]!);

      expect(gap, "adjacent plans need a gap between them").toBeGreaterThan(1);
    }
  });
});

describe("planSatisfies", () => {
  it("lets a plan satisfy itself", () => {
    for (const plan of planKeys) {
      expect(planSatisfies(plan, plan)).toBe(true);
    }
  });

  it("lets a higher plan satisfy a lower requirement", () => {
    expect(planSatisfies("plus", "basic")).toBe(true);
    expect(planSatisfies("professional", "basic")).toBe(true);
    expect(planSatisfies("professional", "plus")).toBe(true);
  });

  it("does not let a lower plan satisfy a higher requirement", () => {
    expect(planSatisfies("basic", "plus")).toBe(false);
    expect(planSatisfies("basic", "professional")).toBe(false);
    expect(planSatisfies("plus", "professional")).toBe(false);
  });

  /** The whole point of ranking: every plan clears the free requirement. */
  it("means everything a free user can do, a paying user can also do", () => {
    for (const plan of planKeys) {
      expect(planSatisfies(plan, defaultPlanKey)).toBe(true);
    }
  });
});

describe("the default plan", () => {
  it("is the lowest-ranked plan, so expiry can always fall back to it", () => {
    for (const plan of planKeys) {
      expect(planRank(defaultPlanKey)).toBeLessThanOrEqual(planRank(plan));
    }
  });

  it("is a real plan", () => {
    const asKey: PlanKey = defaultPlanKey;

    expect(isPlanKey(asKey)).toBe(true);
  });
});

describe("isPlanKey", () => {
  it("accepts every declared plan", () => {
    for (const plan of planKeys) {
      expect(isPlanKey(plan)).toBe(true);
    }
  });

  /**
   * A plan name arrives from a database column, a webhook payload or a form. None of
   * those are trustworthy, and a plan name this build does not know must not be treated
   * as a plan — least of all as a paid one.
   */
  it("rejects anything that is not one", () => {
    expect(isPlanKey("pro")).toBe(false);
    expect(isPlanKey("PROFESSIONAL")).toBe(false);
    expect(isPlanKey("basic ")).toBe(false);
    expect(isPlanKey("")).toBe(false);
    expect(isPlanKey(null)).toBe(false);
    expect(isPlanKey(undefined)).toBe(false);
    expect(isPlanKey(0)).toBe(false);
    expect(isPlanKey(["professional"])).toBe(false);
    expect(isPlanKey({ plan: "professional" })).toBe(false);
  });
});
