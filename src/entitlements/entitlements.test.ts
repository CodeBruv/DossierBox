import { describe, expect, it } from "vitest";
import { documentTypeMinPlan } from "@/documents/catalogue";
import { capabilityKeys, isCapabilityKey } from "./capabilities";
import {
  allowanceFor,
  denialReasons,
  entitlementFor,
  freeEntitlement,
  hasCapability,
  requireCapability,
  requirePlan,
  requireQuota,
  satisfiesPlan,
  summarise,
} from "./entitlements";
import { planKeys, planRank, type PlanKey } from "./plan-keys";
import {
  capabilitiesAddedBy,
  cheapestPlanExceeding,
  cheapestPlanWith,
  planList,
  planQuota,
  planRegistry,
} from "./plans";
import {
  allowanceExceeds,
  allowanceExhausted,
  allowanceLimit,
  allowancePermits,
  allowanceRemaining,
  isQuotaKey,
  limited,
  quotaKeys,
  unlimited,
} from "./quotas";
import type { Subscription } from "./subscription";
import { estimatedUnits, type WorkloadKind } from "./usage";

/*
 * What is being defended here, in order of how much it would cost to get wrong.
 *
 * 1. A lapsed subscription must actually lose its capabilities, not merely its label. A
 *    downgrade that changes the plan name while leaving the grants in place is the failure the
 *    requirements name outright: premium access must end.
 * 2. The plan ladder must be a ladder. If a middle plan grants something the top plan does
 *    not, someone upgrading loses a feature — and nothing in the type system prevents it.
 * 3. The free tier must be genuinely useful rather than a crippled demonstration. That is a
 *    product promise, and it is checkable: the free allowance is measured against what
 *    producing a document actually costs.
 * 4. Nothing a browser receives may carry provider or subscription identifiers.
 */

const now = new Date("2026-06-15T12:00:00.000Z");
const day = 24 * 60 * 60 * 1000;

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    plan: "professional",
    status: "active",
    currentPeriodEnd: new Date(now.getTime() + 10 * day),
    cancelAtPeriodEnd: false,
    provider: "stripe",
    providerSubscriptionId: "sub_test",
    ...overrides,
  };
}

const repeated = <T>(values: readonly T[]): readonly T[] => {
  const seen = new Set<T>();

  return values.filter((value) => (seen.has(value) ? true : (seen.add(value), false)));
};

describe("the plan catalogue", () => {
  it("declares a coherent definition for every plan", () => {
    for (const key of planKeys) {
      const plan = planRegistry[key];

      expect(plan.key, "the record key and the definition key must match").toBe(key);
      expect(plan.label.length, `${key} needs a label`).toBeGreaterThan(0);
      expect(plan.tagline.length, `${key} needs a tagline`).toBeGreaterThan(0);
      expect(repeated(plan.capabilities), `${key} repeats a capability`).toEqual([]);
    }
  });

  /**
   * The label is separate from the key precisely so marketing copy can change without a data
   * migration. The keys are what appear in stored rows and in `minPlan` declarations, so they
   * must not read as marketing.
   */
  it("names plans for users without using the key as the name", () => {
    expect(planRegistry.basic.label).toBe("Free");
    expect(planRegistry.plus.label).toBe("Starter");
    expect(planRegistry.professional.label).toBe("Pro");
  });

  it("presents plans cheapest first", () => {
    const ranks = planList.map((plan) => planRank(plan.key));

    for (let index = 1; index < ranks.length; index += 1) {
      expect(ranks[index]).toBeGreaterThan(ranks[index - 1] ?? -1);
    }
  });

  /**
   * The ladder property. Nothing in the type system stops a middle plan granting something the
   * plan above it does not, and the consequence would be a customer paying more and losing a
   * feature. Asserted rather than produced by inheritance, because inheritance would make
   * removing a capability from the top plan silently remove it from nowhere.
   */
  it("grants everything the plan below it grants", () => {
    for (const plan of planList) {
      const beneath = planList.filter((other) => planRank(other.key) < planRank(plan.key));

      for (const lower of beneath) {
        for (const capability of lower.capabilities) {
          expect(
            plan.capabilities,
            `${plan.key} does not grant ${capability}, which ${lower.key} does`,
          ).toContain(capability);
        }
      }
    }
  });

  it("never reduces a quota as the plans go up", () => {
    for (const quota of quotaKeys) {
      for (let index = 1; index < planList.length; index += 1) {
        const higher = planList[index];
        const lower = planList[index - 1];
        if (!higher || !lower) continue;

        const reduced = allowanceExceeds(lower.quotas[quota], higher.quotas[quota]);

        expect(reduced, `${higher.key} allows less ${quota} than ${lower.key}`).toBe(false);
      }
    }
  });

  /**
   * A capability no plan grants is a promise with nothing behind it — it would appear on a
   * comparison table as a row of crosses, or worse, be gated against forever.
   */
  it("has a plan behind every capability it describes", () => {
    for (const capability of capabilityKeys) {
      expect(cheapestPlanWith(capability), `no plan grants ${capability}`).not.toBeNull();
    }
  });

  it("reports what each plan adds rather than repeating what it inherits", () => {
    expect(capabilitiesAddedBy("basic")).toEqual([]);
    expect(capabilitiesAddedBy("plus")).toEqual([
      "document_set_generation",
      "opportunity_interpretation",
    ]);
    expect(capabilitiesAddedBy("professional")).not.toContain("document_set_generation");
    expect(capabilitiesAddedBy("professional")).not.toContain("opportunity_interpretation");
    expect(capabilitiesAddedBy("professional").length).toBeGreaterThan(0);
  });

  it("pins the monthly Opportunity Interpretation allowances", () => {
    expect(allowanceLimit(planQuota("basic", "opportunity_interpretations"))).toBe(0);
    expect(allowanceLimit(planQuota("plus", "opportunity_interpretations"))).toBe(10);
    expect(allowanceLimit(planQuota("professional", "opportunity_interpretations"))).toBe(30);
  });

  it("points an upgrade at the cheapest plan that would allow it", () => {
    expect(cheapestPlanWith("document_set_generation")).toBe("plus");
    expect(cheapestPlanWith("objective_tailoring")).toBe("professional");
    expect(cheapestPlanExceeding("stored_documents", planQuota("basic", "stored_documents")))
      .toBe("plus");
    expect(cheapestPlanExceeding("stored_documents", unlimited)).toBeNull();
  });

  /** No price belongs in this module: currency, market and provider identity are payment facts. */
  it("states no price", () => {
    const declared = JSON.stringify(planList).toLowerCase();

    for (const term of ["price", "amount", "usd", "currency", "$", "monthly"]) {
      expect(declared, `the plan catalogue mentions ${term}`).not.toContain(term);
    }
  });
});

describe("the free tier being genuinely useful", () => {
  /*
   * One complete first pass over a document, as the writing pipeline is expected to run it:
   * decide which experience is relevant, restate a few achievements, then tailor the whole
   * thing. An estimate of a phase that does not exist yet — which is exactly why it lives in
   * the test rather than in the plan catalogue, where it would look authoritative.
   */
  const oneDocumentPass: readonly WorkloadKind[] = [
    "experience_relevance_matching",
    "achievement_reframing",
    "achievement_reframing",
    "achievement_reframing",
    "resume_tailoring",
  ];

  it("gives the free plan a document to keep", () => {
    expect(allowanceLimit(planQuota("basic", "stored_documents"))).toBeGreaterThanOrEqual(1);
  });

  /**
   * The difference between a free product and a demonstration. One non-repeatable attempt is a
   * screenshot; being able to revise is a document. Two passes is the floor.
   */
  it("gives the free plan enough writing help to revise, not just to try once", () => {
    const pass = estimatedUnits(oneDocumentPass);
    const allowed = allowanceLimit(planQuota("basic", "writing_units")) ?? 0;

    expect(pass, "the estimate itself must cost something").toBeGreaterThan(0);
    expect(
      allowed,
      `the free allowance of ${allowed} units is under two passes at ${pass} units each`,
    ).toBeGreaterThanOrEqual(pass * 2);
  });

  it("gives a paid plan room for a set of documents rather than one", () => {
    const pass = estimatedUnits(oneDocumentPass);
    const plus = allowanceLimit(planQuota("plus", "writing_units")) ?? 0;

    expect(plus).toBeGreaterThanOrEqual(pass * 4);
    expect(allowanceLimit(planQuota("plus", "stored_documents")) ?? 0).toBeGreaterThan(1);
  });
});

describe("quota arithmetic", () => {
  it("permits up to the ceiling and not past it", () => {
    const allowance = limited(3);

    expect(allowancePermits(allowance, 0)).toBe(true);
    expect(allowancePermits(allowance, 2)).toBe(true);
    expect(allowancePermits(allowance, 3)).toBe(false);
    expect(allowanceExhausted(allowance, 3)).toBe(true);
  });

  it("checks a batch before any of it runs", () => {
    const allowance = limited(3);

    expect(allowancePermits(allowance, 1, 2)).toBe(true);
    expect(allowancePermits(allowance, 1, 3)).toBe(false);
  });

  it("always permits an unlimited allowance", () => {
    expect(allowancePermits(unlimited, 10_000, 500)).toBe(true);
    expect(allowanceLimit(unlimited)).toBeNull();
    expect(allowanceRemaining(unlimited, 10)).toBeNull();
  });

  it("permits an empty request", () => {
    expect(allowancePermits(limited(0), 0, 0)).toBe(true);
  });

  it("allows nothing at a ceiling of zero", () => {
    expect(allowancePermits(limited(0), 0)).toBe(false);
  });

  /**
   * A Professional account with forty documents that lapses to Basic has used forty of one.
   * The spec forbids deleting a user's work over a subscription, so this state is normal and
   * must be describable — a negative remainder would render a progress bar backwards.
   */
  it("floors the remainder when a downgrade leaves the user over the ceiling", () => {
    expect(allowanceRemaining(limited(1), 40)).toBe(0);
    expect(allowancePermits(limited(1), 40)).toBe(false);
  });

  it("refuses a ceiling that is not a whole count", () => {
    expect(() => limited(-1)).toThrow();
    expect(() => limited(1.5)).toThrow();
  });

  it("orders allowances so an upgrade can be found", () => {
    expect(allowanceExceeds(limited(5), limited(1))).toBe(true);
    expect(allowanceExceeds(limited(1), limited(5))).toBe(false);
    expect(allowanceExceeds(unlimited, limited(1_000))).toBe(true);
    expect(allowanceExceeds(limited(1_000), unlimited)).toBe(false);
    expect(allowanceExceeds(unlimited, unlimited)).toBe(false);
  });
});

describe("evaluating an entitlement", () => {
  it("gives a user with no subscription the free plan's grants", () => {
    const entitlement = freeEntitlement(now);

    expect(entitlement.plan).toBe("basic");
    expect(hasCapability(entitlement, "document_set_generation")).toBe(false);
    expect(allowanceFor(entitlement, "stored_documents")).toEqual(
      planQuota("basic", "stored_documents"),
    );
  });

  it("gives a current subscriber their plan's grants", () => {
    const entitlement = entitlementFor(subscription(), now);

    expect(entitlement.plan).toBe("professional");
    expect(hasCapability(entitlement, "objective_tailoring")).toBe(true);
    expect(hasCapability(entitlement, "advanced_writing_assistance")).toBe(true);
  });

  /**
   * The requirement, in one assertion. The plan lapsed, and what has to disappear is the
   * *capability* — not merely the plan name shown on an account page.
   */
  it("takes the capabilities away when the subscription lapses", () => {
    const lapsed = entitlementFor(
      subscription({ currentPeriodEnd: new Date(now.getTime() - 60 * day) }),
      now,
    );

    expect(lapsed.plan).toBe("basic");
    for (const capability of capabilityKeys) {
      expect(
        hasCapability(lapsed, capability),
        `${capability} survived the subscription lapsing`,
      ).toBe(false);
    }
    expect(lapsed.standing.purchasedPlan, "what was bought is still visible").toBe("professional");
    expect(lapsed.standing.lapsed).toBe(true);
  });

  it("reduces the quotas too, not only the capabilities", () => {
    const lapsed = entitlementFor(
      subscription({ currentPeriodEnd: new Date(now.getTime() - 60 * day) }),
      now,
    );

    expect(allowanceFor(lapsed, "stored_documents")).toEqual(
      planQuota("basic", "stored_documents"),
    );
  });

  it("records the moment it was evaluated at, so a decision can be traced", () => {
    expect(entitlementFor(null, now).evaluatedAt).toBe(now);
  });

  it("compares against a plan floor stated elsewhere", () => {
    const free = freeEntitlement(now);
    const pro = entitlementFor(subscription(), now);

    expect(satisfiesPlan(free, "basic")).toBe(true);
    expect(satisfiesPlan(free, "plus")).toBe(false);
    expect(satisfiesPlan(pro, "plus")).toBe(true);
  });
});

describe("the join with a document's stated requirement", () => {
  /**
   * The composition the entitlement module documents but deliberately does not perform: it
   * never imports the document catalogue, because the catalogue already imports plan keys in
   * order to declare `minPlan`. The caller joins them. Proved here, where crossing layers is
   * the point of the test.
   */
  it("decides a document type from its own minPlan declaration", () => {
    const free = freeEntitlement(now);
    const pro = entitlementFor(subscription(), now);

    expect(requirePlan(free, documentTypeMinPlan("professional_cv")).allowed).toBe(true);
    expect(requirePlan(free, documentTypeMinPlan("cover_letter")).allowed).toBe(false);
    expect(requirePlan(pro, documentTypeMinPlan("cover_letter")).allowed).toBe(true);
    expect(requirePlan(pro, documentTypeMinPlan("research_statement")).allowed).toBe(true);
  });

  it("names the plan a refused document type needs", () => {
    const decision = requirePlan(freeEntitlement(now), documentTypeMinPlan("research_statement"));

    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe("plan_too_low");
    expect(decision.requiredPlan).toBe(documentTypeMinPlan("research_statement"));
  });
});

describe("a refusal", () => {
  it("allows what the plan includes, without explanation", () => {
    const pro = entitlementFor(subscription(), now);

    expect(requireCapability(pro, "objective_tailoring")).toEqual({ allowed: true });
  });

  it("names the cheapest plan that would allow a missing capability", () => {
    const decision = requireCapability(freeEntitlement(now), "document_set_generation");

    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe("capability_not_included");
    expect(decision.requiredPlan).toBe("plus");
  });

  it("reports the ceiling and what is left when a quota is spent", () => {
    const free = freeEntitlement(now);
    const limit = allowanceLimit(planQuota("basic", "stored_documents")) ?? 0;
    const decision = requireQuota(free, "stored_documents", limit);

    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe("quota_exhausted");
    expect(decision.limit).toBe(limit);
    expect(decision.remaining).toBe(0);
    expect(decision.requiredPlan).toBe("plus");
  });

  it("permits a quota that still has room", () => {
    expect(requireQuota(freeEntitlement(now), "writing_units", 0).allowed).toBe(true);
  });

  /** A set is several documents at once; the user should be stopped before the third of four. */
  it("refuses a batch that would exceed the ceiling even though one would not", () => {
    const free = freeEntitlement(now);

    expect(requireQuota(free, "stored_documents", 0, 1).allowed).toBe(true);
    expect(requireQuota(free, "stored_documents", 0, 4).allowed).toBe(false);
  });

  it("gives every refusal a reason from the declared set", () => {
    const free = freeEntitlement(now);
    const decisions = [
      requireCapability(free, "objective_tailoring"),
      requirePlan(free, "professional"),
      requireQuota(free, "stored_documents", 99),
    ];

    for (const decision of decisions) {
      expect(decision.allowed).toBe(false);
      if (decision.allowed) continue;
      expect(denialReasons).toContain(decision.reason);
    }
  });
});

describe("what a browser is told", () => {
  /**
   * The summary is the only shape of this that is meant to cross to a client, so it is the one
   * place a provider identifier or a subscription id could leak. Asserted against the
   * serialised form, because that is what would actually travel.
   */
  it("carries no provider, subscription id or period dates", () => {
    const serialised = JSON.stringify(summarise(entitlementFor(subscription(), now))).toLowerCase();

    for (const term of ["stripe", "sub_test", "provider", "subscriptionid", "periodend"]) {
      expect(serialised, `the summary leaks ${term}`).not.toContain(term);
    }
  });

  it("says which capabilities are included and which are not", () => {
    const summary = summarise(freeEntitlement(now));

    expect(summary.plan).toBe("basic");
    expect(summary.planLabel).toBe("Free");
    expect(summary.capabilities).toHaveLength(capabilityKeys.length);
    for (const capability of summary.capabilities) {
      expect(capability.included).toBe(false);
      expect(capability.label.length).toBeGreaterThan(0);
    }
  });

  it("reports the plan in force, not the one that was purchased", () => {
    const lapsed = summarise(
      entitlementFor(subscription({ currentPeriodEnd: new Date(now.getTime() - 60 * day) }), now),
    );

    expect(lapsed.plan).toBe("basic");
    expect(lapsed.capabilities.every((capability) => !capability.included)).toBe(true);
  });

  it("lists a ceiling for every quota", () => {
    const summary = summarise(entitlementFor(subscription(), now));

    expect(summary.quotas.map((quota) => quota.key)).toEqual([...quotaKeys]);
  });
});

describe("the grant vocabularies", () => {
  it("accepts every declared name and nothing else", () => {
    for (const key of capabilityKeys) expect(isCapabilityKey(key)).toBe(true);
    for (const key of quotaKeys) expect(isQuotaKey(key)).toBe(true);

    expect(isCapabilityKey("document_sets")).toBe(false);
    expect(isQuotaKey("documents")).toBe(false);
    expect(isCapabilityKey(null)).toBe(false);
  });

  it("refuses an inherited property name", () => {
    for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(isCapabilityKey(name), `${name} was accepted as a capability`).toBe(false);
      expect(isQuotaKey(name), `${name} was accepted as a quota`).toBe(false);
    }
  });

  /** Every plan key must be usable as a plan. Cheap, and it fails if a key is ever renamed. */
  it("resolves a definition for every plan key", () => {
    for (const key of planKeys) {
      const plan: PlanKey = key;

      expect(planRegistry[plan].key).toBe(key);
    }
  });
});
