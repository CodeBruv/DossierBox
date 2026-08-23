import { describe, expect, it } from "vitest";
import {
  chargeableUnits,
  consumedUnits,
  estimatedUnits,
  isWorkloadKind,
  workloadKinds,
  workloadList,
  workloadUnits,
  type UsageRecord,
} from "./usage";

/*
 * Two claims are being held to account here.
 *
 * 1. The weights are ordered and integral. They are estimates — nothing has measured them —
 *    but "an estimate" is not a licence for a table where restating one line costs more than
 *    aligning a whole application. The ordering is the part that has to be defensible.
 * 2. A usage record carries no career content. The spec forbids putting a user's history or a
 *    prompt into metering, and that is the kind of rule that decays by one convenient field at
 *    a time, so the field list itself is asserted.
 */

function record(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    userId: "user_1",
    workload: "resume_tailoring",
    outcome: "succeeded",
    estimatedUnits: 5,
    units: 5,
    plan: "plus",
    provider: null,
    model: null,
    providerCost: null,
    occurredAt: new Date("2026-06-15T12:00:00.000Z"),
    documentId: null,
    applicationId: null,
    ...overrides,
  };
}

describe("the workload table", () => {
  it("declares a coherent descriptor for every kind", () => {
    for (const kind of workloadKinds) {
      const descriptor = workloadList.find((candidate) => candidate.kind === kind);

      expect(descriptor, `${kind} has no descriptor`).toMatchObject({ kind });
      expect(descriptor?.label.length, `${kind} needs a label`).toBeGreaterThan(0);
    }

    expect(workloadList).toHaveLength(workloadKinds.length);
  });

  /** Fractional weights would make every quota comparison approximate. */
  it("weighs every kind as a positive whole number of units", () => {
    for (const kind of workloadKinds) {
      const units = workloadUnits(kind);

      expect(Number.isInteger(units), `${kind} has a fractional weight`).toBe(true);
      expect(units, `${kind} must cost something`).toBeGreaterThan(0);
    }
  });

  /**
   * The table is declared cheapest first and says so. Read in that order the numbers should
   * make sense as "about this much more work than the last"; an unordered table would mean
   * the reasoning behind them had been lost.
   */
  it("is declared in non-decreasing order of cost", () => {
    const units = workloadList.map((descriptor) => descriptor.units);

    for (let index = 1; index < units.length; index += 1) {
      expect(
        units[index],
        `${workloadList[index]?.kind} is declared after a more expensive kind`,
      ).toBeGreaterThanOrEqual(units[index - 1] ?? 0);
    }
  });

  /** The unit everything else is relative to. If this moves, every plan's number changes meaning. */
  it("keeps the smallest piece of work as one unit", () => {
    expect(workloadUnits("achievement_reframing")).toBe(1);
  });

  /** The claim in the doc comment: aligning a whole application is the largest operation. */
  it("charges most for the operation that reads and edits several documents", () => {
    const heaviest = Math.max(...workloadList.map((descriptor) => descriptor.units));

    expect(workloadUnits("application_set_alignment")).toBe(heaviest);
  });

  it("names every workload it will need a prompt for", () => {
    /*
     * The prompt library in the next phase is keyed by these names. Listed here so that adding
     * a prompt without a weight, or a weight without a prompt, is a visible change rather than
     * a quota that silently costs nothing.
     */
    expect([...workloadKinds].sort()).toEqual(
      [
        "achievement_reframing",
        "academic_statement_generation",
        "application_set_alignment",
        "cover_letter_generation",
        "document_consistency_review",
        "experience_relevance_matching",
        "motivation_letter_generation",
        "personal_statement_generation",
        "resume_tailoring",
      ].sort(),
    );
  });
});

describe("estimating a batch", () => {
  it("sums the weights of the work to be done", () => {
    expect(estimatedUnits(["achievement_reframing", "achievement_reframing"])).toBe(2);
    expect(estimatedUnits(["experience_relevance_matching", "resume_tailoring"])).toBe(7);
  });

  it("costs nothing for no work", () => {
    expect(estimatedUnits([])).toBe(0);
  });
});

describe("what is charged", () => {
  it("charges a successful piece of work its units", () => {
    expect(chargeableUnits(record({ outcome: "succeeded", units: 5 }))).toBe(5);
  });

  /**
   * A user who asked for help and did not get it has not received anything to pay for. The
   * record is still kept — a provider may have billed us — which is why this is a function on
   * the record rather than a decision made when the record is written.
   */
  it("charges nothing for a failure", () => {
    expect(chargeableUnits(record({ outcome: "failed", units: 5 }))).toBe(0);
  });

  it("totals only the successful work in a period", () => {
    expect(
      consumedUnits([
        record({ outcome: "succeeded", units: 5 }),
        record({ outcome: "failed", units: 8 }),
        record({ outcome: "succeeded", units: 2 }),
      ]),
    ).toBe(7);
  });

  it("totals nothing for no records", () => {
    expect(consumedUnits([])).toBe(0);
  });
});

describe("what a usage record may hold", () => {
  /**
   * The privacy rule, asserted rather than trusted. A field named `prompt`, `content` or
   * anything similar is how metering quietly becomes a second copy of the user's career
   * history — which the spec forbids and which no amount of access control makes safe.
   */
  it("holds no prompt, no generated text and no career content", () => {
    const fields = Object.keys(record());

    for (const field of fields) {
      expect(field, `${field} looks like it carries content`).not.toMatch(
        /prompt|content|text|body|dossier|summary|profile|history/i,
      );
    }
  });

  it("holds exactly the fields metering needs", () => {
    expect(Object.keys(record()).sort()).toEqual(
      [
        "applicationId",
        "documentId",
        "estimatedUnits",
        "model",
        "occurredAt",
        "outcome",
        "plan",
        "provider",
        "providerCost",
        "units",
        "userId",
        "workload",
      ].sort(),
    );
  });

  /**
   * The plan the work was performed under, not the user's plan now. Without it a month of
   * records is unreadable the moment someone upgrades, and a quota dispute cannot be settled.
   */
  it("records the entitlement the work was drawn from", () => {
    expect(record({ plan: "professional" }).plan).toBe("professional");
  });

  /** No provider ran, so there is nothing to attribute. Not zero cost — unknown cost. */
  it("allows a record with no provider, for work the engine did deterministically", () => {
    const deterministic = record({ provider: null, model: null, providerCost: null });

    expect(deterministic.provider).toBeNull();
    expect(deterministic.providerCost).toBeNull();
  });
});

describe("the workload guard", () => {
  it("accepts every declared kind and nothing else", () => {
    for (const kind of workloadKinds) {
      expect(isWorkloadKind(kind)).toBe(true);
    }

    expect(isWorkloadKind("resume_generation")).toBe(false);
    expect(isWorkloadKind("")).toBe(false);
    expect(isWorkloadKind(null)).toBe(false);
  });

  it("refuses an inherited property name", () => {
    expect(isWorkloadKind("constructor")).toBe(false);
    expect(isWorkloadKind("toString")).toBe(false);
    expect(isWorkloadKind("__proto__")).toBe(false);
  });
});
