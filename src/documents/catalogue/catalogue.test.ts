import { describe, expect, it } from "vitest";
import { planKeys, type PlanKey } from "@/entitlements/plan-keys";
import {
  availableDocumentFamilyKeys,
  availableDocumentTypeList,
  availableDocumentTypesByFamily,
  correspondenceSectionKeys,
  documentFamilies,
  documentFamilyKeys,
  documentFamilyList,
  documentHeadingOverrides,
  documentSectionHeading,
  documentSectionKeys,
  documentSectionMaxWords,
  documentSectionOrder,
  documentSectionSlots,
  documentSectionStatus,
  documentSections,
  documentTypeAllowsSection,
  documentTypeDescription,
  documentTypeFamily,
  documentTypeKeys,
  documentTypeLabel,
  documentTypeList,
  documentTypeRegistry,
  dossierBackedSectionKeys,
  getDocumentType,
  isAvailableDocumentType,
  isDocumentSectionKey,
  isDocumentTypeKey,
  plannedDocumentTypeKeys,
  profileSectionsUsedBy,
  sectionHeading,
  shippingDocumentTypeKeys,
  type ShippingDocumentTypeKey,
} from "./index";
import { documentType } from "../schema";

/*
 * The catalogue is the product's answer to "what is a document?". These tests guard the
 * two things that would break quietly: a declaration that disagrees with the database,
 * and a declaration that disagrees with what the engine can produce.
 */

describe("the catalogue and the database agree", () => {
  /**
   * Compile-time assertions, which are the ones that matter: they fail under
   * `tsc --noEmit` the moment the two vocabularies diverge, rather than at runtime in
   * front of a user whose document will not load.
   *
   * Both directions can be checked because the shipping keys are their own tuple. A
   * stored type with no declaration would break reads; a shipping declaration with no
   * enum value would break writes. Only `planned` types are exempt, and only because no
   * row can hold one.
   */
  it("describes exactly the set of types the database can store", () => {
    type StoredType = (typeof documentType.enumValues)[number];

    const catalogueCoversDatabase: ShippingDocumentTypeKey = null as unknown as StoredType;
    const databaseCoversCatalogue: StoredType = null as unknown as ShippingDocumentTypeKey;
    void catalogueCoversDatabase;
    void databaseCoversCatalogue;

    for (const stored of documentType.enumValues) {
      expect(isDocumentTypeKey(stored), `${stored} is stored but not registered`).toBe(true);
    }
  });

  /**
   * The migration trigger.
   *
   * A shipping type is one a user can create, so it must have somewhere to be stored. The
   * day a `planned` type is flipped to `shipping` this test fails, which is exactly the
   * moment the enum migration is needed — rather than the moment an insert fails in
   * production.
   */
  it("can store every type it offers, and offers every type it can store", () => {
    const offered = availableDocumentTypeList.map((definition) => definition.key);

    expect([...offered].sort()).toEqual([...documentType.enumValues].sort());
  });

  /**
   * The tuples decide what is storable; the `availability` field is what the matching
   * engine and the UI read. Nothing but this test stops the two from disagreeing, and a
   * disagreement would produce either a button that cannot save or a type that silently
   * vanishes from the catalogue.
   */
  it("keeps the shipping tuple and the availability field in step", () => {
    for (const key of shippingDocumentTypeKeys) {
      expect(documentTypeRegistry[key].availability, `${key} is listed as shipping`).toBe(
        "shipping",
      );
    }
    for (const key of plannedDocumentTypeKeys) {
      expect(documentTypeRegistry[key].availability, `${key} is listed as planned`).toBe("planned");
    }
    expect([...shippingDocumentTypeKeys, ...plannedDocumentTypeKeys].sort()).toEqual(
      [...documentTypeKeys].sort(),
    );
  });
});

describe("document types", () => {
  it("declares a coherent definition for every registered key", () => {
    for (const key of documentTypeKeys) {
      const definition = documentTypeRegistry[key];

      expect(definition.key, "the record key and the definition key must match").toBe(key);
      expect(definition.label.length, `${key} needs a label`).toBeGreaterThan(0);
      expect(definition.description.length, `${key} needs a description`).toBeGreaterThan(0);
      expect(documentFamilyKeys, `${key} needs a real family`).toContain(definition.family);
      expect(planKeys, `${key} needs a real minimum plan`).toContain(definition.minPlan);
      expect(definition.styleCategories.length, `${key} needs a style category`).toBeGreaterThan(0);
    }
  });

  /**
   * Presence in the array means eligible and position means order, so a duplicate key
   * would render a section twice and an unknown key would render nothing — both silent.
   */
  it("lists each section at most once, and only real sections", () => {
    for (const key of documentTypeKeys) {
      const slots = documentSectionSlots(key);
      const keys = slots.map((slot) => slot.key);

      expect(new Set(keys).size, `${key} must not repeat a section`).toBe(keys.length);
      for (const slot of slots) {
        expect(isDocumentSectionKey(slot.key), `${key} lists an unknown section`).toBe(true);
      }
    }
  });

  /**
   * True of *these three* types, not of documents in general: all three are
   * full-history sectioned documents that differ by emphasis, so any dossier section a
   * user has filled in must appear in all of them. The letter types legitimately list six
   * correspondence sections and none of these eleven, which is why this is scoped to the
   * three by name rather than written as a rule about every type.
   */
  it("lets the three sectioned career types present every dossier section", () => {
    const expected = [...dossierBackedSectionKeys].sort();

    for (const key of ["professional_cv", "professional_resume", "academic_cv"] as const) {
      expect([...documentSectionOrder(key)].sort(), `${key} must present every section`).toEqual(
        expected,
      );
    }
  });

  /**
   * The complement, and the reason the section vocabulary had to stop being the dossier's.
   * A cover letter is not a CV with sections removed; it draws on none of them.
   */
  it("builds a letter from correspondence sections alone", () => {
    for (const key of ["cover_letter", "motivation_letter"] as const) {
      const order = documentSectionOrder(key);

      expect([...order]).toEqual([...correspondenceSectionKeys]);
      for (const section of order) {
        expect(
          dossierBackedSectionKeys,
          `${key} must not draw on the dossier's section list`,
        ).not.toContain(section);
      }
    }
  });

  it("builds a statement from nothing but its prose", () => {
    expect([...documentSectionOrder("research_statement")]).toEqual(["body"]);
    expect(documentSections.body.source).toEqual({ kind: "authored" });
    expect(documentSections.body.layout).toBe("prose");
  });

  /**
   * The reason `maxWords` sits on the slot and not on the section: one authored `body`,
   * three different lengths. Had the budget lived on the section definition, these three
   * document types would have needed three near-identical section keys.
   */
  it("gives the same authored section a different budget in each document", () => {
    expect(documentSectionMaxWords("cover_letter", "body")).toBe(400);
    expect(documentSectionMaxWords("motivation_letter", "body")).toBe(700);
    expect(documentSectionMaxWords("research_statement", "body")).toBe(1200);
  });

  it("reports no word ceiling where a type declares none", () => {
    expect(documentSectionMaxWords("professional_resume", "summary")).toBeNull();
    expect(
      documentSectionMaxWords("professional_resume", "body"),
      "a section the type never shows has nothing to enforce",
    ).toBeNull();
  });

  /**
   * `maxWords` is meaningless on a section whose content is the user's records — a
   * document does not get to truncate someone's employment history by word count. The
   * type system cannot express that, so it is asserted.
   */
  it("never puts a word ceiling on a section it cannot apply to", () => {
    for (const key of documentTypeKeys) {
      for (const slot of documentSectionSlots(key)) {
        if (slot.maxWords === undefined) continue;

        expect(
          documentSections[slot.key].source.kind,
          `${key}.${slot.key} declares maxWords but is not authored prose`,
        ).toBe("authored");
        expect(slot.maxWords).toBeGreaterThan(0);
      }
    }
  });

  it("derives the section order from the slots, so the two cannot drift", () => {
    for (const key of documentTypeKeys) {
      expect(documentSectionOrder(key)).toEqual(documentSectionSlots(key).map((slot) => slot.key));
    }
  });

  it("keeps the résumé shorter than the CV, and lets an academic CV run", () => {
    expect(getDocumentType("professional_resume").pageBudget).toEqual({ target: 1, max: 2 });
    expect(getDocumentType("professional_cv").pageBudget).toEqual({ target: 2, max: 3 });
    expect(getDocumentType("academic_cv").pageBudget).toBeNull();
  });

  it("never declares a target longer than the maximum", () => {
    for (const key of documentTypeKeys) {
      const budget = getDocumentType(key).pageBudget;
      if (budget) expect(budget.target).toBeLessThanOrEqual(budget.max);
    }
  });

  it("reads labels and descriptions from the registry", () => {
    expect(documentTypeLabel("professional_resume")).toBe("Professional résumé");
    expect(documentTypeDescription("academic_cv")).toContain("cross-border");
    expect(documentTypeFamily("academic_cv")).toBe(documentFamilies.academic);
  });
});

describe("what a user may be offered", () => {
  /**
   * The rule that prevents a button that cannot do anything. Every currently registered
   * type ships, so this passes trivially today — it exists to fail the moment a
   * `planned` type is added and something forgets to filter.
   */
  it("offers only types the engine can produce", () => {
    for (const definition of availableDocumentTypeList) {
      expect(definition.availability).toBe("shipping");
    }
  });

  it("accepts a shipping type and rejects anything else", () => {
    expect(isAvailableDocumentType("professional_cv")).toBe(true);
    expect(isAvailableDocumentType("motivation_letter")).toBe(false);
    expect(isAvailableDocumentType("")).toBe(false);
    expect(isAvailableDocumentType(null)).toBe(false);
    expect(isAvailableDocumentType(undefined)).toBe(false);
    expect(isAvailableDocumentType(42)).toBe(false);
    expect(isAvailableDocumentType({ key: "professional_cv" })).toBe(false);
  });

  /** `constructor` and `toString` are on every object; `in` would say yes without this. */
  it("is not fooled by inherited property names", () => {
    expect(isDocumentTypeKey("constructor")).toBe(false);
    expect(isDocumentTypeKey("toString")).toBe(false);
    expect(isDocumentSectionKey("constructor")).toBe(false);
    expect(isDocumentSectionKey("hasOwnProperty")).toBe(false);
  });

  it("keeps the offered list in catalogue order", () => {
    expect(availableDocumentTypeList.map((definition) => definition.key)).toEqual(
      documentTypeList
        .filter((definition) => definition.availability === "shipping")
        .map((definition) => definition.key),
    );
  });

  it("groups by family without printing a heading over nothing", () => {
    const groups = availableDocumentTypesByFamily();

    for (const group of groups) {
      expect(group.types.length).toBeGreaterThan(0);
      for (const definition of group.types) {
        expect(definition.family).toBe(group.family.key);
      }
    }

    const order = groups.map((group) => group.family.sortOrder);
    expect(order, "families must stay in declared order").toEqual([...order].sort((a, b) => a - b));
    expect(availableDocumentFamilyKeys()).toEqual(groups.map((group) => group.family.key));
  });

  it("accounts for every offered type exactly once across the groups", () => {
    const grouped = availableDocumentTypesByFamily().flatMap((group) =>
      group.types.map((definition) => definition.key),
    );

    expect([...grouped].sort()).toEqual(
      [...availableDocumentTypeList.map((definition) => definition.key)].sort(),
    );
  });
});

describe("sections", () => {
  it("declares a coherent definition for every registered key", () => {
    for (const key of documentSectionKeys) {
      const definition = documentSections[key];

      expect(definition.key, "the record key and the definition key must match").toBe(key);
      expect(definition.heading.length, `${key} needs a heading`).toBeGreaterThan(0);
    }
  });

  /**
   * The career objective comes from the user's basics, not from a dossier list. Getting
   * this wrong would either print the wrong content or invent a section the user never
   * filled in, so it is asserted rather than assumed.
   */
  it("sources the career objective from basics", () => {
    expect(documentSections.summary.source).toEqual({
      kind: "basics",
      field: "careerDirection",
    });
  });

  it("reports only the dossier sections a document actually draws on", () => {
    const used = profileSectionsUsedBy("professional_cv");

    expect(used).toContain("experience");
    expect(used).toContain("publications");
    expect(used, "summary is basics-sourced, not a dossier section").not.toContain("summary");
    expect(new Set(used).size).toBe(used.length);
  });

  it("uses the catalogue heading when a type has no convention of its own", () => {
    for (const key of documentTypeKeys) {
      expect(
        documentHeadingOverrides(key),
        `${key} must not silently rename a section yet`,
      ).toBeUndefined();
      expect(documentSectionHeading(key, "links")).toBe("Links");
    }
  });

  it("honours an override when one is supplied", () => {
    expect(sectionHeading("experience")).toBe("Experience");
    expect(sectionHeading("experience", { experience: "Appointments" })).toBe("Appointments");
    expect(sectionHeading("education", { experience: "Appointments" })).toBe("Education");
  });

  it("answers whether a type shows a section, and how important it is", () => {
    expect(documentSectionStatus("professional_resume", "experience")).toBe("required");
    expect(documentSectionStatus("professional_resume", "publications")).toBe("optional");
    expect(documentTypeAllowsSection("professional_resume", "publications")).toBe(true);
  });
});

/*
 * The guard that stands between a form post and an insert.
 *
 * `isAvailableDocumentType` is the only thing that stops a `planned` type — registered so
 * document sets can name it, with no database enum value behind it — from reaching the
 * repository. A previous revision typed it as narrowing to `DocumentTypeKey`, which
 * compiled and looked correct while quietly permitting exactly that. These assertions are
 * mostly for the compiler.
 */
describe("the storable-type guard", () => {
  it("narrows a posted value to something the database can hold", () => {
    const posted: unknown = "professional_cv";

    if (!isAvailableDocumentType(posted)) throw new Error("expected a shipping type");

    /*
     * The load-bearing line. If the guard is ever widened back to `DocumentTypeKey` this
     * stops compiling, because a planned key has no enum value to be assigned to.
     */
    const storable: (typeof documentType.enumValues)[number] = posted;
    expect(storable).toBe("professional_cv");
  });

  it("refuses a registered type the engine cannot produce", () => {
    for (const planned of plannedDocumentTypeKeys) {
      expect(isDocumentTypeKey(planned), `${planned} should still be registered`).toBe(true);
      expect(isAvailableDocumentType(planned), `${planned} must not be creatable`).toBe(false);
    }
  });
});

describe("families", () => {
  it("declares a coherent definition for every registered key", () => {
    for (const key of documentFamilyKeys) {
      const family = documentFamilies[key];

      expect(family.key).toBe(key);
      expect(family.label.length).toBeGreaterThan(0);
      expect(family.description.length).toBeGreaterThan(0);
    }
  });

  it("orders the list by declared sort order, and includes every family", () => {
    expect(documentFamilyList.map((family) => family.key).sort()).toEqual(
      [...documentFamilyKeys].sort(),
    );

    const order = documentFamilyList.map((family) => family.sortOrder);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size, "two families must not share a position").toBe(order.length);
  });
});

describe("the free plan", () => {
  /**
   * The product requires that the free tier be genuinely useful, so this asserts the
   * commitment rather than trusting it: every document type currently offered must be
   * creatable without paying.
   */
  it("can create every document type the product currently offers", () => {
    const free: PlanKey = "basic";

    for (const definition of availableDocumentTypeList) {
      expect(definition.minPlan, `${definition.key} must not be paywalled yet`).toBe(free);
    }
  });
});
