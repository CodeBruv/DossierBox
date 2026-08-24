import { describe, expect, it } from "vitest";
import type { ImportCandidate, ImportResult } from "./candidates";
import {
  buildImportReview,
  collectImportSelection,
  importFieldName,
  importIncludeName,
  IMPORT_BASICS_ROW,
} from "./review";

/* Helpers --------------------------------------------------------------------- */

function candidate(overrides: Partial<ImportCandidate> & Pick<ImportCandidate, "id" | "section">): ImportCandidate {
  return {
    values: {},
    source: [],
    notes: [],
    ...overrides,
  };
}

function result(overrides: Partial<ImportResult> = {}): ImportResult {
  return {
    basics: { values: {}, source: [], notes: [] },
    candidates: [],
    skipped: [],
    ...overrides,
  };
}

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

/** A complete experience row: every field the section requires was read. */
const completeExperience = candidate({
  id: "experience.1",
  section: "experience",
  values: {
    type: "employment",
    role: "Site Supervisor",
    organization: "Halden Construction",
    startYear: "2019",
  },
  source: ["Site Supervisor", "Halden Construction", "2019 – 2022"],
});

/* The submission is not authoritative -------------------------------------------
 *
 * These are the tests that matter most. A server action is a public endpoint, and the form
 * arrives from whoever is submitting it — so what the form may decide is exactly the
 * question, and the answer must be "which of the parser's rows to keep, and what their
 * values now say" and nothing beyond that.
 */

describe("reading an import submission", () => {
  it("ignores a ticked row the stored import does not contain", () => {
    const selection = collectImportSelection(
      result({ candidates: [completeExperience] }),
      form({
        [importIncludeName("experience.99")]: "on",
        [importFieldName("experience.99", "role")]: "Chief Executive",
        [importFieldName("experience.99", "organization")]: "Invented Ltd",
        [importFieldName("experience.99", "type")]: "employment",
      }),
    );

    expect(selection.entries).toEqual([]);
  });

  it("takes the section from the stored candidate, not from the row id in the form", () => {
    const selection = collectImportSelection(
      result({ candidates: [completeExperience] }),
      form({
        [importIncludeName("experience.1")]: "on",
        [importFieldName("experience.1", "role")]: "Site Supervisor",
      }),
    );

    /*
     * The row id happens to begin with a section name, which is a naming convention and not a
     * grant. Were the section read out of the id, renaming a row in the form would choose
     * which table a write lands in.
     */
    expect(selection.entries).toHaveLength(1);
    expect(selection.entries[0]?.section).toBe("experience");
  });

  it("drops field names the section does not define", () => {
    const selection = collectImportSelection(
      result({ candidates: [completeExperience] }),
      form({
        [importIncludeName("experience.1")]: "on",
        [importFieldName("experience.1", "role")]: "Site Supervisor",
        [importFieldName("experience.1", "profileId")]: "someone-else",
        [importFieldName("experience.1", "id")]: "00000000-0000-0000-0000-000000000000",
      }),
    );

    expect(Object.keys(selection.entries[0]?.values ?? {}).sort()).toEqual(["role"]);
  });

  it("treats an absent include checkbox as no, because that is what a browser sends", () => {
    const selection = collectImportSelection(
      result({ candidates: [completeExperience] }),
      form({ [importFieldName("experience.1", "role")]: "Site Supervisor" }),
    );

    expect(selection.entries).toEqual([]);
    expect(selection.basics).toBeNull();
  });

  it("keeps rows with adjacent indexes apart", () => {
    const first = candidate({ id: "experience.1", section: "experience" });
    const eleventh = candidate({ id: "experience.11", section: "experience" });

    const selection = collectImportSelection(
      result({ candidates: [first, eleventh] }),
      form({
        [importIncludeName("experience.1")]: "on",
        [importIncludeName("experience.11")]: "on",
        [importFieldName("experience.1", "role")]: "First",
        [importFieldName("experience.11", "role")]: "Eleventh",
      }),
    );

    /* `field.experience.1.` must not swallow `field.experience.11.role`. */
    expect(selection.entries.map((entry) => entry.values.role)).toEqual(["First", "Eleventh"]);
  });

  it("reads only the profile's own columns for the details row", () => {
    const selection = collectImportSelection(
      result(),
      form({
        [importIncludeName(IMPORT_BASICS_ROW)]: "on",
        [importFieldName(IMPORT_BASICS_ROW, "displayName")]: "Amara Nwosu",
        [importFieldName(IMPORT_BASICS_ROW, "planKey")]: "pro",
      }),
    );

    expect(selection.basics).toEqual({ displayName: "Amara Nwosu" });
  });

  it("carries a correction the user typed over what the document said", () => {
    const selection = collectImportSelection(
      result({ candidates: [completeExperience] }),
      form({
        [importIncludeName("experience.1")]: "on",
        [importFieldName("experience.1", "organization")]: "Halden Construction Ltd",
      }),
    );

    expect(selection.entries[0]?.values.organization).toBe("Halden Construction Ltd");
  });
});

/* What the review screen shows -------------------------------------------------- */

describe("building the review", () => {
  it("shows a required field the document did not state, so it can be asked for", () => {
    const review = buildImportReview(
      result({
        candidates: [
          candidate({
            id: "experience.1",
            section: "experience",
            values: { role: "Site Supervisor" },
          }),
        ],
      }),
    );

    const row = review.groups[0]?.rows[0];
    const organization = row?.fields.find((entry) => entry.field.name === "organization");

    expect(organization).toBeDefined();
    expect(organization?.value).toBe("");
    expect(organization?.read).toBe(false);
  });

  it("leaves out optional fields the document said nothing about", () => {
    const review = buildImportReview(
      result({ candidates: [completeExperience] }),
    );

    const shown = review.groups[0]?.rows[0]?.fields.map((entry) => entry.field.name) ?? [];

    /* A dozen empty boxes per row would turn reviewing back into data entry. */
    expect(shown).not.toContain("description");
    expect(shown).not.toContain("location");
  });

  it("separates needing a look from needing more typing", () => {
    const review = buildImportReview(
      result({
        candidates: [
          candidate({
            ...completeExperience,
            notes: ["We were not certain which line was the employer."],
          }),
        ],
      }),
    );

    const row = review.groups[0]?.rows[0];

    /*
     * The distinction the tick depends on. This row is flagged, and is also perfectly
     * savable — so it is pre-ticked and still marked for attention.
     */
    expect(row?.status).toBe("review");
    expect(row?.ready).toBe(true);
  });

  it("is not ready when a required field was not read", () => {
    const review = buildImportReview(
      result({
        candidates: [
          candidate({
            id: "experience.1",
            section: "experience",
            values: { role: "Site Supervisor", organization: "Halden Construction" },
          }),
        ],
      }),
    );

    const row = review.groups[0]?.rows[0];

    expect(row?.ready).toBe(false);
    expect(row?.status).toBe("review");
  });

  it("is matched and ready when every required field was read and nothing was noted", () => {
    const review = buildImportReview(result({ candidates: [completeExperience] }));
    const row = review.groups[0]?.rows[0];

    expect(row?.status).toBe("matched");
    expect(row?.ready).toBe(true);
    expect(review.rowsNeedingReview).toBe(0);
  });

  it("drops the end of a period the document said is current", () => {
    const review = buildImportReview(
      result({
        candidates: [
          candidate({
            id: "experience.1",
            section: "experience",
            values: { ...completeExperience.values, current: "on", endYear: "2022" },
          }),
        ],
      }),
    );

    const shown = review.groups[0]?.rows[0]?.fields.map((entry) => entry.field.name) ?? [];

    /* Submitting a current entry *and* an end date is what the dossier's own rule refuses. */
    expect(shown).toContain("current");
    expect(shown).not.toContain("endYear");
    expect(shown).not.toContain("endMonth");
  });

  it("shows the field a shown field depends on", () => {
    const review = buildImportReview(
      result({
        candidates: [
          candidate({
            id: "education.1",
            section: "education",
            values: { institution: "University of Leeds", grade: "2:1" },
          }),
        ],
      }),
    );

    const shown = review.groups[0]?.rows[0]?.fields.map((entry) => entry.field.name) ?? [];

    /* A grade with no system is a value nobody can interpret, ours or the user's. */
    expect(shown).toContain("gradingSystem");
  });

  it("orders groups the way the dossier does, not the way the document did", () => {
    const review = buildImportReview(
      result({
        candidates: [
          candidate({ id: "skills.1", section: "skills", values: { name: "Welding" } }),
          candidate({ id: "experience.1", section: "experience", values: { role: "Fitter" } }),
          candidate({ id: "education.1", section: "education", values: { institution: "TAFE" } }),
        ],
      }),
    );

    expect(review.groups.map((group) => group.section)).toEqual([
      "experience",
      "education",
      "skills",
    ]);
  });

  it("names a row after its section when the document gave nothing nameable", () => {
    const review = buildImportReview(
      result({
        candidates: [
          candidate({ id: "education.1", section: "education", values: { field: "Nursing" } }),
        ],
      }),
    );

    /* Honest, rather than named after whichever line we happened to keep. */
    expect(review.groups[0]?.rows[0]?.title).toBe("Education record");
  });

  it("names a row from its own values, employer included", () => {
    const review = buildImportReview(result({ candidates: [completeExperience] }));

    expect(review.groups[0]?.rows[0]?.title).toBe("Site Supervisor — Halden Construction");
  });

  it("keeps a career objective in the user's own words", () => {
    const objective =
      "Looking to move from site supervision into project management on commercial builds.";
    const review = buildImportReview(
      result({ basics: { values: { careerDirection: objective }, source: [], notes: [] } }),
    );

    const field = review.basics.fields.find((entry) => entry.field.name === "careerDirection");

    /* Requirement: the user's statement of direction arrives verbatim, not summarised. */
    expect(field?.value).toBe(objective);
  });

  it("reports the details row as empty when the document said nothing about the person", () => {
    const review = buildImportReview(result({ candidates: [completeExperience] }));

    expect(review.basics.empty).toBe(true);
    /* An empty details row is not one of the items we claim to have found. */
    expect(review.totalRows).toBe(1);
  });

  it("counts the details row once it holds something", () => {
    const review = buildImportReview(
      result({
        basics: { values: { displayName: "Amara Nwosu" }, source: [], notes: [] },
        candidates: [completeExperience],
      }),
    );

    expect(review.basics.empty).toBe(false);
    expect(review.totalRows).toBe(2);
  });

  it("passes through text it could not place rather than dropping it", () => {
    const review = buildImportReview(
      result({ skipped: ["Referees available on request"] }),
    );

    expect(review.skipped).toEqual(["Referees available on request"]);
  });
});
