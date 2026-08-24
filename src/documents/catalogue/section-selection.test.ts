import { describe, expect, it } from "vitest";
import {
  defaultSectionSelection,
  documentSectionOrder,
  documentTypeKeys,
  hideableSections,
  orderSections,
  permittedSections,
  requiredSections,
  resolveSectionSelection,
  sectionIsPermitted,
} from "./index";

/*
 * These tests guard the one rule that keeps "composable sections" from meaning "whatever
 * the caller passed": a document contains what its type declares, and nothing else. The
 * inputs below are the realistic hostile ones — a stale key from an older build, a
 * tampered form post, a duplicate from a drag-and-drop list, a request that omits a
 * required section — because every one of them arrives as a string from outside the server.
 */

describe("what a document type permits", () => {
  it("permits exactly the sections it declares", () => {
    for (const key of documentTypeKeys) {
      expect(permittedSections(key)).toEqual(documentSectionOrder(key));
    }
  });

  it("splits its sections into the ones it will not release and the rest", () => {
    for (const key of documentTypeKeys) {
      const required = requiredSections(key);
      const hideable = hideableSections(key);

      expect([...required, ...hideable].sort()).toEqual([...permittedSections(key)].sort());
      for (const section of required) {
        expect(hideable, `${key}.${section} cannot be both required and hideable`).not.toContain(
          section,
        );
      }
    }
  });

  it("knows a letter has no employment history and a résumé has no salutation", () => {
    expect(sectionIsPermitted("cover_letter", "experience")).toBe(false);
    expect(sectionIsPermitted("cover_letter", "body")).toBe(true);
    expect(sectionIsPermitted("professional_resume", "salutation")).toBe(false);
    expect(sectionIsPermitted("professional_resume", "experience")).toBe(true);
  });

  it("is not fooled by inherited property names", () => {
    expect(sectionIsPermitted("professional_cv", "constructor")).toBe(false);
    expect(sectionIsPermitted("professional_cv", "toString")).toBe(false);
    expect(sectionIsPermitted("professional_cv", "hasOwnProperty")).toBe(false);
  });
});

describe("resolving a requested selection", () => {
  it("keeps a valid request exactly as asked", () => {
    const requested = ["experience", "education", "skills", "summary"];
    const result = resolveSectionSelection("professional_cv", requested);

    expect(result.sections).toEqual(requested);
    expect(result.rejected).toEqual([]);
    expect(result.restored).toEqual([]);
  });

  it("honours a reordering, rather than resetting to catalogue order", () => {
    const result = resolveSectionSelection("professional_cv", [
      "education",
      "experience",
      "summary",
    ]);

    expect(result.sections).toEqual(["education", "experience", "summary"]);
  });

  it("reports every section the user chose to hide", () => {
    const result = resolveSectionSelection("professional_cv", ["experience", "education"]);

    expect(result.sections).toEqual(["experience", "education"]);
    expect(result.hidden).toContain("publications");
    expect(result.hidden).toContain("links");
    expect(result.hidden, "a shown section is not hidden").not.toContain("experience");
  });

  /**
   * The requirement this module exists for. A dossier containing publications does not
   * put publications into a cover letter, and a request that says otherwise is refused
   * rather than obeyed.
   */
  it("refuses a section the type does not have, whatever the dossier contains", () => {
    const result = resolveSectionSelection("cover_letter", [
      "body",
      "experience",
      "publications",
      "salutation",
    ]);

    expect(result.sections).not.toContain("experience");
    expect(result.sections).not.toContain("publications");
    expect(result.rejected).toEqual(["experience", "publications"]);
  });

  it("refuses a value that is not a section key at all", () => {
    const result = resolveSectionSelection("professional_cv", [
      "experience",
      "constructor",
      "__proto__",
      "salary_expectations",
      "",
    ]);

    /* `education` is restored because a CV requires it; `skills` is only `recommended`
     * here — it is required in a résumé — so leaving it out is the user's to decide. */
    expect(result.sections).toEqual(["experience", "education"]);
    expect(result.rejected).toEqual(["constructor", "__proto__", "salary_expectations", ""]);
  });

  it("reports a repeated bad entry once", () => {
    const result = resolveSectionSelection("professional_cv", ["nope", "nope", "nope"]);

    expect(result.rejected).toEqual(["nope"]);
  });

  it("renders a duplicated section once, without calling it an error", () => {
    const result = resolveSectionSelection("professional_cv", [
      "experience",
      "experience",
      "education",
    ]);

    expect(result.sections).toEqual(["experience", "education"]);
    expect(result.rejected).toEqual([]);
  });

  /**
   * Hiding a required section would change what the document *is*, so it is put back — and
   * reported, so a UI can lock the control rather than quietly overruling the user.
   */
  it("puts back a required section the request left out, and says it did", () => {
    const result = resolveSectionSelection("professional_resume", ["summary", "links"]);

    expect(result.sections).toContain("experience");
    expect(result.sections).toContain("skills");
    expect(result.sections).toContain("education");
    expect([...result.restored].sort()).toEqual(["education", "experience", "skills"]);
  });

  it("restores a required section on the right side of its neighbours", () => {
    /* `summary` precedes `experience` in the catalogue and `links` follows it. */
    const result = resolveSectionSelection("professional_resume", ["summary", "links"]);

    const summary = result.sections.indexOf("summary");
    const experience = result.sections.indexOf("experience");
    const links = result.sections.indexOf("links");

    expect(summary).toBeLessThan(experience);
    expect(experience).toBeLessThan(links);
  });

  it("yields the required sections alone when nothing is requested", () => {
    const result = resolveSectionSelection("professional_resume", []);

    expect([...result.sections].sort()).toEqual([...requiredSections("professional_resume")].sort());
    expect(result.rejected).toEqual([]);
  });

  /** Total and non-throwing for every type, because refusing to render is never the answer. */
  it("always returns at least the required sections, for every type", () => {
    for (const key of documentTypeKeys) {
      for (const requested of [[], ["rubbish"], ["constructor"], permittedSections(key)]) {
        const result = resolveSectionSelection(key, [...requested]);

        for (const section of requiredSections(key)) {
          expect(result.sections, `${key} dropped a required section`).toContain(section);
        }
        expect(new Set(result.sections).size, `${key} repeated a section`).toBe(
          result.sections.length,
        );
        for (const section of result.sections) {
          expect(sectionIsPermitted(key, section), `${key} admitted ${section}`).toBe(true);
        }
      }
    }
  });

  it("accounts for every permitted section as either shown or hidden", () => {
    for (const key of documentTypeKeys) {
      const result = resolveSectionSelection(key, ["summary", "body"]);

      expect([...result.sections, ...result.hidden].sort()).toEqual(
        [...permittedSections(key)].sort(),
      );
    }
  });
});

describe("the default selection", () => {
  /**
   * Composition currently renders every section a type lists, so this asserts that
   * adopting the selection model changes no existing output. If the default were narrowed
   * to the required sections, every document already generated would silently lose
   * content on regeneration.
   */
  it("shows everything the type permits, matching what composition already renders", () => {
    for (const key of documentTypeKeys) {
      expect(defaultSectionSelection(key)).toEqual(documentSectionOrder(key));
    }
  });

  it("survives a round trip through resolution unchanged", () => {
    for (const key of documentTypeKeys) {
      const result = resolveSectionSelection(key, [...defaultSectionSelection(key)]);

      expect(result.sections).toEqual(defaultSectionSelection(key));
      expect(result.hidden).toEqual([]);
      expect(result.rejected).toEqual([]);
      expect(result.restored).toEqual([]);
    }
  });
});

/*
 * Order is the other half of the same decision and behaves differently on one point that
 * matters: a section missing from a requested *order* has not been hidden, it has simply
 * not been mentioned. Dropping it would remove a section from someone's document as a side
 * effect of a later build adding one, so these tests pin that down.
 */
describe("resolving a requested order", () => {
  it("uses the type's own order when nothing is requested", () => {
    for (const key of documentTypeKeys) {
      expect(orderSections(key, [])).toEqual(documentSectionOrder(key));
    }
  });

  it("honours the requested order", () => {
    const order = orderSections("professional_cv", ["education", "summary"]);

    /*
     * Relative order, not absolute position. `experience` was not mentioned, so it keeps
     * its catalogue neighbours and can land ahead of both — which is the right outcome for
     * the case this arises in: an order stored before a section existed. What the request
     * does control is that education now precedes summary, reversing the type's own order.
     */
    expect(order.indexOf("education")).toBeLessThan(order.indexOf("summary"));
  });

  it("keeps every section the type permits, exactly once", () => {
    for (const key of documentTypeKeys) {
      const permitted = permittedSections(key);
      const requested = [...permitted].reverse().slice(0, 2);
      const order = orderSections(key, [...requested, ...requested]);

      expect([...order].sort()).toEqual([...permitted].sort());
      expect(new Set(order).size).toBe(order.length);
    }
  });

  it("places an unmentioned section among its catalogue neighbours, not at the end", () => {
    const permitted = permittedSections("professional_cv");
    const [first, second, third] = permitted;
    /* A stored order from a build that did not know about `second`. */
    const order = orderSections("professional_cv", [first!, third!]);

    expect(order.indexOf(second!)).toBeLessThan(order.indexOf(third!));
  });

  it("reproduces a full arrangement exactly — the case the control posts", () => {
    for (const key of documentTypeKeys) {
      const arrangement = [...permittedSections(key)].reverse();

      expect(orderSections(key, arrangement)).toEqual(arrangement);
    }
  });

  it("ignores keys the type does not permit", () => {
    const order = orderSections("professional_resume", ["publications", "constructor", ""]);

    expect(order).toEqual(permittedSections("professional_resume"));
  });
});
