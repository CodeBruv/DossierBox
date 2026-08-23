import { describe, expect, it } from "vitest";
import {
  documentFamilyKeys,
  documentTypeKeys,
  documentTypeRegistry,
  isDocumentTypeKey,
  plannedDocumentTypeKeys,
  shippingDocumentTypeKeys,
} from "@/documents/catalogue";
import { defaultPlanKey, planKeys, planRank } from "@/entitlements/plan-keys";
import {
  applicationObjectiveKindList,
  applicationObjectiveKindRegistry,
  applicationObjectiveKinds,
  applicationObjectiveLimits,
  compatibilityLevel,
  defaultApplicationObjectiveKind,
  defaultDocumentsFor,
  documentCompatibilityLevels,
  documentSetFor,
  documentSetForObjective,
  emptyApplicationObjective,
  familiesFor,
  gradeDocumentTypes,
  hasObjectiveDetail,
  highestPlanRequiredBy,
  isApplicationObjectiveKind,
  isConventionalFor,
  leadDocument,
  normalizeApplicationObjective,
  producibleMembers,
  suggestedDocumentTypes,
  unproducibleMembers,
  validateApplicationObjective,
} from "./index";

/*
 * Three things are being guarded here.
 *
 * 1. The objective is a *boundary*. Every field reaches a language model eventually, so
 *    the bounds and the guards are load-bearing rather than tidy.
 * 2. A document set is honest. It names documents we cannot yet produce instead of
 *    quietly shortening the list, and it states plan requirements without granting
 *    anything.
 * 3. Compatibility advises and never forbids, because the user may know something about
 *    their application that the product does not.
 */

describe("objective kinds", () => {
  it("declares a coherent definition for every registered kind", () => {
    for (const kind of applicationObjectiveKinds) {
      const definition = applicationObjectiveKindRegistry[kind];

      expect(definition.key, "the record key and the definition key must match").toBe(kind);
      expect(definition.label.length, `${kind} needs a label`).toBeGreaterThan(0);
      expect(definition.description.length, `${kind} needs a description`).toBeGreaterThan(0);
      expect(definition.defaultDocuments.length, `${kind} needs a document`).toBeGreaterThan(0);
      expect(definition.families.length, `${kind} needs a family`).toBeGreaterThan(0);
    }
  });

  it("names only real document types, without repeating one", () => {
    for (const kind of applicationObjectiveKinds) {
      const documents = defaultDocumentsFor(kind);

      for (const type of documents) {
        expect(isDocumentTypeKey(type), `${kind} names an unknown document`).toBe(true);
      }
      expect(new Set(documents).size, `${kind} repeats a document`).toBe(documents.length);
    }
  });

  it("names only real families, without repeating one", () => {
    for (const kind of applicationObjectiveKinds) {
      const families = familiesFor(kind);

      for (const family of families) {
        expect(documentFamilyKeys, `${kind} names an unknown family`).toContain(family);
      }
      expect(new Set(families).size, `${kind} repeats a family`).toBe(families.length);
    }
  });

  /**
   * Otherwise an objective could recommend a document it also grades as unconventional,
   * and the picker would contradict its own explanation.
   */
  it("permits the family of every document it recommends", () => {
    for (const kind of applicationObjectiveKinds) {
      for (const type of defaultDocumentsFor(kind)) {
        expect(
          familiesFor(kind),
          `${kind} recommends ${type} but does not permit its family`,
        ).toContain(documentTypeRegistry[type].family);
      }
    }
  });

  it("keeps the list in registry order and includes every kind", () => {
    expect(applicationObjectiveKindList.map((definition) => definition.key)).toEqual([
      ...applicationObjectiveKinds,
    ]);
  });

  it("accepts a real kind and rejects anything else", () => {
    expect(isApplicationObjectiveKind("scholarship")).toBe(true);
    expect(isApplicationObjectiveKind("")).toBe(false);
    expect(isApplicationObjectiveKind(null)).toBe(false);
    expect(isApplicationObjectiveKind(undefined)).toBe(false);
    expect(isApplicationObjectiveKind(7)).toBe(false);
    expect(isApplicationObjectiveKind({ kind: "scholarship" })).toBe(false);
  });

  /** `in` would walk the prototype chain and say yes to all three. */
  it("is not fooled by inherited property names", () => {
    expect(isApplicationObjectiveKind("constructor")).toBe(false);
    expect(isApplicationObjectiveKind("toString")).toBe(false);
    expect(isApplicationObjectiveKind("hasOwnProperty")).toBe(false);
  });

  it("has a default kind that is a real kind", () => {
    expect(isApplicationObjectiveKind(defaultApplicationObjectiveKind)).toBe(true);
  });
});

describe("an empty objective", () => {
  it("is a valid objective, because the facts come from the profile", () => {
    const objective = emptyApplicationObjective("scholarship");

    expect(validateApplicationObjective(objective).success).toBe(true);
    expect(objective.kind).toBe("scholarship");
  });

  it("has nothing to tailor to", () => {
    expect(hasObjectiveDetail(emptyApplicationObjective())).toBe(false);
  });

  it("counts a single detail as detail", () => {
    expect(hasObjectiveDetail({ ...emptyApplicationObjective(), organisation: "Leiden" })).toBe(
      true,
    );
    expect(
      hasObjectiveDetail({ ...emptyApplicationObjective(), requestedDocuments: ["CV"] }),
    ).toBe(true);
  });

  /**
   * A deadline is not tailoring material: a date tells the writing layer nothing about
   * what to say, and treating it as detail would make the product claim it could tailor a
   * document when it cannot.
   */
  it("does not treat a deadline as something to tailor to", () => {
    expect(hasObjectiveDetail({ ...emptyApplicationObjective(), deadline: "2026-10-31" })).toBe(
      false,
    );
  });

  it("round-trips through normalisation unchanged, so it can be stored", () => {
    const objective = emptyApplicationObjective("research");

    expect(normalizeApplicationObjective(JSON.parse(JSON.stringify(objective)))).toEqual(objective);
  });

  /**
   * An objective stored before `deadline` existed must still read back. Losing a whole
   * objective because the schema grew a field would destroy work the user had already done,
   * and `deadline` is the first field to be added but will not be the last.
   */
  it("still parses an objective written before a field existed", () => {
    const stored: Record<string, unknown> = { ...emptyApplicationObjective("fellowship") };
    delete stored.deadline;

    const recovered = normalizeApplicationObjective(stored);

    expect(recovered).not.toBeNull();
    expect(recovered?.deadline).toBeNull();
    expect(recovered?.kind).toBe("fellowship");
  });
});

describe("validating an objective", () => {
  const base = { kind: "employment" as const, requestedDocuments: [] };

  it("requires a kind it recognises", () => {
    expect(validateApplicationObjective({ ...base, kind: "dream_job" }).success).toBe(false);
    expect(validateApplicationObjective({ requestedDocuments: [] }).success).toBe(false);
    expect(validateApplicationObjective(null).success).toBe(false);
    expect(validateApplicationObjective("employment").success).toBe(false);
  });

  it("trims text and turns an empty field into null", () => {
    const result = validateApplicationObjective({
      ...base,
      targetRole: "  Systems Engineer  ",
      organisation: "   ",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.targetRole).toBe("Systems Engineer");
    expect(result.data.organisation).toBeNull();
  });

  /**
   * The bound that matters most: `requirements` is where someone pastes an entire careers
   * page, and it is the field most likely to carry text addressed to the model rather
   * than to us.
   */
  it("refuses text past its limit, and accepts text at it", () => {
    const limit = applicationObjectiveLimits.requirements;

    expect(
      validateApplicationObjective({ ...base, requirements: "x".repeat(limit) }).success,
    ).toBe(true);
    expect(
      validateApplicationObjective({ ...base, requirements: "x".repeat(limit + 1) }).success,
    ).toBe(false);
  });

  it("explains which field is too long, in language a user can act on", () => {
    const result = validateApplicationObjective({
      ...base,
      targetRole: "x".repeat(applicationObjectiveLimits.targetRole + 1),
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    const message = result.error.issues[0]?.message ?? "";
    expect(message).toContain("Role");
    expect(message).toContain("too long");
  });

  it("upper-cases a country code and refuses one that is not a code", () => {
    const accepted = validateApplicationObjective({ ...base, country: "nl" });
    expect(accepted.success).toBe(true);
    if (accepted.success) expect(accepted.data.country).toBe("NL");

    expect(validateApplicationObjective({ ...base, country: "Netherlands" }).success).toBe(false);
    expect(validateApplicationObjective({ ...base, country: "N" }).success).toBe(false);
  });

  it("bounds a word or page limit rather than trusting the number", () => {
    expect(validateApplicationObjective({ ...base, wordLimit: 500 }).success).toBe(true);
    expect(validateApplicationObjective({ ...base, wordLimit: 0 }).success).toBe(false);
    expect(validateApplicationObjective({ ...base, wordLimit: 1.5 }).success).toBe(false);
    expect(
      validateApplicationObjective({
        ...base,
        wordLimit: applicationObjectiveLimits.wordLimit.max + 1,
      }).success,
    ).toBe(false);
    expect(
      validateApplicationObjective({
        ...base,
        pageLimit: applicationObjectiveLimits.pageLimit.max + 1,
      }).success,
    ).toBe(false);
  });

  it("accepts a deadline as a calendar date", () => {
    const result = validateApplicationObjective({ ...base, deadline: "2026-10-31" });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.deadline).toBe("2026-10-31");
  });

  /** `new Date("2026-02-30")` rolls forward rather than failing, so this is a real risk. */
  it("refuses a date that does not exist", () => {
    expect(validateApplicationObjective({ ...base, deadline: "2026-02-30" }).success).toBe(false);
    expect(validateApplicationObjective({ ...base, deadline: "2026-13-01" }).success).toBe(false);
    expect(validateApplicationObjective({ ...base, deadline: "31/10/2026" }).success).toBe(false);
    expect(validateApplicationObjective({ ...base, deadline: "next Friday" }).success).toBe(false);
  });

  /**
   * Refusing a passed deadline would stop someone recording an application they have
   * already sent, which is the application deciding it knows better than the user.
   */
  it("accepts a deadline in the past", () => {
    expect(validateApplicationObjective({ ...base, deadline: "2019-01-01" }).success).toBe(true);
  });

  it("treats an absent deadline as absent", () => {
    const result = validateApplicationObjective({ ...base, deadline: "  " });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.deadline).toBeNull();
  });

  it("keeps requested documents as the words the opportunity used", () => {
    const result = validateApplicationObjective({
      ...base,
      requestedDocuments: ["Curriculum Vitae", " Personal Statement ", "", "  "],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    /* Not mapped onto our vocabulary — that judgement belongs to the matching engine. */
    expect(result.data.requestedDocuments).toEqual(["Curriculum Vitae", "Personal Statement"]);
  });

  it("caps how many documents an opportunity may ask for", () => {
    const many = Array.from(
      { length: applicationObjectiveLimits.requestedDocuments + 1 },
      (_, index) => `Document ${index}`,
    );

    expect(validateApplicationObjective({ ...base, requestedDocuments: many }).success).toBe(false);
  });

  it("returns null rather than throwing for a value that is not an objective", () => {
    expect(normalizeApplicationObjective(undefined)).toBeNull();
    expect(normalizeApplicationObjective({ kind: "nonsense" })).toBeNull();
    expect(normalizeApplicationObjective([])).toBeNull();
  });
});

describe("document sets", () => {
  it("resolves a set for every objective kind", () => {
    for (const kind of applicationObjectiveKinds) {
      const set = documentSetFor(kind);

      expect(set.objective).toBe(kind);
      expect(set.members.map((member) => member.type)).toEqual([...defaultDocumentsFor(kind)]);
    }
  });

  it("gives a job application a résumé and a cover letter", () => {
    const set = documentSetFor("employment");

    expect(set.members.map((member) => member.type)).toEqual([
      "professional_resume",
      "cover_letter",
    ]);
    expect(set.members[0]?.role).toBe("primary");
    expect(set.members[1]?.role).toBe("supporting");
  });

  it("gives exactly one primary document, first", () => {
    for (const kind of applicationObjectiveKinds) {
      const roles = documentSetFor(kind).members.map((member) => member.role);

      expect(roles.filter((role) => role === "primary")).toHaveLength(1);
      expect(roles[0]).toBe("primary");
    }
  });

  /**
   * The honesty requirement. A scholarship needs a motivation letter whether or not we can
   * produce one, and the set says so rather than presenting a shorter list as the whole
   * answer.
   */
  it("keeps a document it cannot produce, and marks the set incomplete", () => {
    const set = documentSetFor("scholarship");

    expect(set.members.map((member) => member.type)).toContain("motivation_letter");
    expect(set.complete).toBe(false);
    expect(unproducibleMembers(set).map((member) => member.type)).toEqual(["motivation_letter"]);
    expect(producibleMembers(set).map((member) => member.type)).toEqual(["academic_cv"]);
  });

  it("is complete only when every member ships", () => {
    for (const kind of applicationObjectiveKinds) {
      const set = documentSetFor(kind);

      expect(set.complete).toBe(
        set.members.every((member) => shippingDocumentTypeKeys.includes(member.type as never)),
      );
    }
  });

  it("offers something to start with wherever anything can be produced", () => {
    for (const kind of applicationObjectiveKinds) {
      const set = documentSetFor(kind);
      const lead = leadDocument(set);

      if (producibleMembers(set).length === 0) {
        expect(lead).toBeNull();
      } else {
        expect(lead?.available).toBe(true);
        expect(lead?.type).toBe(producibleMembers(set)[0]?.type);
      }
    }
  });

  it("states the plan a whole set needs, without granting it", () => {
    /* Every shipping type is free today, so a set of shipping types needs the free plan. */
    expect(highestPlanRequiredBy(documentSetFor("general_profile"))).toBe(defaultPlanKey);

    /* A research set includes a `professional`-gated research statement. */
    expect(highestPlanRequiredBy(documentSetFor("research"))).toBe("professional");

    for (const kind of applicationObjectiveKinds) {
      const set = documentSetFor(kind);
      const highest = highestPlanRequiredBy(set);

      expect(planKeys).toContain(highest);
      for (const member of set.members) {
        expect(
          planRank(highest),
          `${kind}: ${member.type} needs more than the set reports`,
        ).toBeGreaterThanOrEqual(planRank(member.minPlan));
      }
    }
  });

  it("resolves from a whole objective, not only from a kind", () => {
    const objective = emptyApplicationObjective("grant");

    expect(documentSetForObjective(objective)).toEqual(documentSetFor("grant"));
  });
});

describe("compatibility between an objective and a document type", () => {
  it("grades every type for every kind, with no gaps", () => {
    for (const kind of applicationObjectiveKinds) {
      const graded = gradeDocumentTypes(kind);

      expect(graded.map((entry) => entry.type).sort()).toEqual([...documentTypeKeys].sort());
      for (const entry of graded) {
        expect(documentCompatibilityLevels).toContain(entry.level);
      }
    }
  });

  it("recommends what the objective conventionally calls for", () => {
    expect(compatibilityLevel("employment", "professional_resume")).toBe("recommended");
    expect(compatibilityLevel("research", "research_statement")).toBe("recommended");

    for (const kind of applicationObjectiveKinds) {
      for (const type of defaultDocumentsFor(kind)) {
        expect(compatibilityLevel(kind, type)).toBe("recommended");
      }
    }
  });

  /**
   * The product stance, asserted. A scholarship panel that wants a professional résumé is
   * asking for something normal, and grading that as wrong would be the product being
   * wrong about the user's own application.
   */
  it("permits a reasonable choice that is not the recommended one", () => {
    expect(compatibilityLevel("scholarship", "professional_resume")).toBe("permitted");
    expect(compatibilityLevel("employment", "professional_cv")).toBe("permitted");
  });

  it("calls an unusual choice unconventional rather than refusing it", () => {
    expect(compatibilityLevel("university_admission", "professional_resume")).toBe(
      "unconventional",
    );
    expect(isConventionalFor("university_admission", "professional_resume")).toBe(false);
  });

  /** There is no level that means "no". A user who insists can always be served. */
  it("never grades anything as forbidden", () => {
    expect(documentCompatibilityLevels).not.toContain("forbidden");

    for (const kind of applicationObjectiveKinds) {
      for (const type of documentTypeKeys) {
        expect(["recommended", "permitted", "unconventional"]).toContain(
          compatibilityLevel(kind, type),
        );
      }
    }
  });

  it("orders the grading best fit first, keeping submission order within it", () => {
    const graded = gradeDocumentTypes("research");
    const recommended = graded
      .filter((entry) => entry.level === "recommended")
      .map((entry) => entry.type);

    expect(recommended).toEqual([...defaultDocumentsFor("research")]);

    const levels = graded.map((entry) => entry.level);
    const ranks = levels.map((level) => documentCompatibilityLevels.indexOf(level));
    expect(ranks, "levels must not interleave").toEqual([...ranks].sort((a, b) => a - b));
  });

  /**
   * Availability and entitlement are separate questions from suitability, and the graded
   * list answers all three separately so a UI can explain rather than just hide a button.
   */
  it("reports availability and plan alongside the grade, without conflating them", () => {
    const graded = gradeDocumentTypes("employment");

    for (const entry of graded) {
      expect(entry.available).toBe(shippingDocumentTypeKeys.includes(entry.type as never));
      expect(entry.minPlan).toBe(documentTypeRegistry[entry.type].minPlan);
    }

    const letter = graded.find((entry) => entry.type === "cover_letter");
    expect(letter?.level, "a cover letter is what a job application wants").toBe("recommended");
    expect(letter?.available, "and we cannot produce one yet").toBe(false);
  });

  it("suggests only what it can both justify and produce", () => {
    for (const kind of applicationObjectiveKinds) {
      const suggested = suggestedDocumentTypes(kind);

      expect(suggested.length, `${kind} must have something to offer`).toBeGreaterThan(0);
      for (const entry of suggested) {
        expect(entry.available, `${kind} suggests an unproducible ${entry.type}`).toBe(true);
        expect(entry.level).not.toBe("unconventional");
        expect(plannedDocumentTypeKeys).not.toContain(entry.type);
      }
    }
  });
});
