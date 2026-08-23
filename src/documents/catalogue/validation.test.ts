import { describe, expect, it } from "vitest";
import { defaultPlanKey } from "@/entitlements/plan-keys";
import {
  describeCatalogueProblems,
  validateCatalogue,
  validateDocumentType,
  type CatalogueProblem,
} from "./validation";
import { documentTypeRegistry, type DocumentTypeDefinition } from "./document-types";

/*
 * Two jobs, and the second is the one that earns the module.
 *
 * 1. The shipped catalogue is coherent — a single assertion that fails the build.
 * 2. Each rule actually fires. A validator that returns nothing is indistinguishable from
 *    a validator that checks nothing, so every rule is proved against a deliberately
 *    broken *candidate* definition. Candidates, not the registry: the point of the
 *    validator is that someone adding a type is told what is wrong with the entry they
 *    wrote, before it is registered.
 */

/** A coherent sectioned type, to be broken one field at a time. */
const candidate = (overrides: Partial<DocumentTypeDefinition> = {}): DocumentTypeDefinition => ({
  key: "professional_cv",
  family: "career",
  structure: "sectioned",
  label: "Skills-first CV",
  description: "A CV that leads with capability rather than chronology.",
  sections: [
    { key: "skills", status: "required" },
    { key: "experience", status: "required" },
    { key: "education", status: "recommended" },
  ],
  styleCategories: ["cv"],
  minPlan: defaultPlanKey,
  pageBudget: { target: 2, max: 3 },
  availability: "shipping",
  ...overrides,
});

/** A coherent letter, since half the structure rules only apply to one. */
const letterCandidate = (
  overrides: Partial<DocumentTypeDefinition> = {},
): DocumentTypeDefinition => ({
  key: "cover_letter",
  family: "career",
  structure: "letter",
  label: "Introduction letter",
  description: "A short letter introducing you to one employer.",
  sections: [
    { key: "letter_date", status: "required" },
    { key: "recipient", status: "required" },
    { key: "salutation", status: "required" },
    { key: "body", status: "required", maxWords: 400 },
    { key: "closing", status: "required" },
    { key: "signature", status: "required" },
  ],
  styleCategories: ["letter"],
  minPlan: "plus",
  pageBudget: { target: 1, max: 1 },
  availability: "planned",
  ...overrides,
});

const complains = (problems: readonly CatalogueProblem[], about: string): boolean =>
  problems.some((problem) => problem.message.includes(about));

describe("the shipped catalogue", () => {
  it("is coherent", () => {
    const problems = validateCatalogue();

    expect(problems, describeCatalogueProblems(problems)).toEqual([]);
  });

  it("accepts every registered type on its own", () => {
    for (const definition of Object.values(documentTypeRegistry)) {
      const problems = validateDocumentType(definition);

      expect(problems, describeCatalogueProblems(problems)).toEqual([]);
    }
  });

  it("accepts the fixtures these tests break, so a failure means the break", () => {
    expect(validateDocumentType(candidate())).toEqual([]);
    expect(validateDocumentType(letterCandidate())).toEqual([]);
  });
});

describe("what a document type must say about itself", () => {
  it("needs a label and a description a user can read", () => {
    expect(complains(validateDocumentType(candidate({ label: "  " })), "label")).toBe(true);
    expect(complains(validateDocumentType(candidate({ description: "" })), "description")).toBe(
      true,
    );
  });

  /**
   * An empty array satisfies `readonly DocumentStyleCategory[]`, so the compiler is happy
   * with a document nothing can ever present.
   */
  it("must accept at least one style category", () => {
    expect(
      complains(validateDocumentType(candidate({ styleCategories: [] })), "no style category"),
    ).toBe(true);
  });

  it("must not repeat a style category", () => {
    expect(
      complains(
        validateDocumentType(candidate({ styleCategories: ["cv", "cv"] })),
        "repeats the style category",
      ),
    ).toBe(true);
  });

  /**
   * The one cross-axis rule in the taxonomy. Family, structure and style category are
   * independent by design — but a letter that accepts a résumé style is not a design
   * choice, and nothing in the type system connects the two fields.
   */
  it("must not accept a style category its structure cannot use", () => {
    expect(
      complains(
        validateDocumentType(candidate({ styleCategories: ["letter"] })),
        "accepts the letter style category",
      ),
    ).toBe(true);
    expect(
      complains(
        validateDocumentType(letterCandidate({ styleCategories: ["resume"] })),
        "accepts the resume style category",
      ),
    ).toBe(true);
  });

  it("must list a section, or it is an empty page", () => {
    expect(complains(validateDocumentType(candidate({ sections: [] })), "no sections")).toBe(true);
  });

  it("must not list the same section twice", () => {
    const problems = validateDocumentType(
      candidate({
        sections: [
          { key: "experience", status: "required" },
          { key: "experience", status: "optional" },
        ],
      }),
    );

    expect(complains(problems, "twice")).toBe(true);
  });

  /** Everything optional means the type states no minimum for being itself. */
  it("must mark something required", () => {
    const problems = validateDocumentType(
      candidate({
        sections: [
          { key: "experience", status: "optional" },
          { key: "education", status: "recommended" },
        ],
      }),
    );

    expect(complains(problems, "no section as required")).toBe(true);
  });
});

describe("agreement between a structure and its sections", () => {
  /**
   * The rule that stops the catalogue drifting back into "every document is a CV with
   * different sections" — the assumption the separate section vocabulary exists to break.
   */
  it("refuses letter apparatus in a sectioned document", () => {
    const problems = validateDocumentType(
      candidate({
        sections: [
          { key: "experience", status: "required" },
          { key: "salutation", status: "optional" },
        ],
      }),
    );

    expect(complains(problems, "letter apparatus")).toBe(true);
  });

  it("refuses a sectioned document that draws on no recorded facts", () => {
    const problems = validateDocumentType(
      candidate({ sections: [{ key: "body", status: "required", maxWords: 500 }] }),
    );

    expect(complains(problems, "none of the user's recorded facts")).toBe(true);
  });

  it("refuses dossier sections in a letter", () => {
    const problems = validateDocumentType(
      letterCandidate({
        sections: [...letterCandidate().sections, { key: "skills", status: "optional" }],
      }),
    );

    expect(complains(problems, "drawn from the dossier")).toBe(true);
  });

  it("refuses a letter with no prose to be the letter", () => {
    const problems = validateDocumentType(
      letterCandidate({
        sections: letterCandidate().sections.filter((slot) => slot.key !== "body"),
      }),
    );

    expect(complains(problems, "no authored prose")).toBe(true);
  });

  /** Named per missing field, so the message says what to add rather than that something is wrong. */
  it("names the letter apparatus a letter is missing", () => {
    const problems = validateDocumentType(
      letterCandidate({
        sections: letterCandidate().sections.filter((slot) => slot.key !== "salutation"),
      }),
    );

    expect(complains(problems, "no salutation")).toBe(true);
  });

  it("refuses letter apparatus in a statement", () => {
    const problems = validateDocumentType(
      candidate({
        structure: "statement",
        styleCategories: ["statement"],
        sections: [
          { key: "salutation", status: "required" },
          { key: "body", status: "required", maxWords: 1200 },
        ],
      }),
    );

    expect(complains(problems, "letter apparatus")).toBe(true);
  });

  it("accepts a statement that is nothing but its prose", () => {
    expect(
      validateDocumentType(
        candidate({
          structure: "statement",
          styleCategories: ["statement"],
          sections: [{ key: "body", status: "required", maxWords: 1200 }],
        }),
      ),
    ).toEqual([]);
  });
});

describe("length declarations", () => {
  /**
   * A word ceiling on the user's own records would mean truncating an employment history
   * by word count, which is a defect dressed as a feature.
   */
  it("refuses a word ceiling on a section drawn from the dossier", () => {
    const problems = validateDocumentType(
      candidate({
        sections: [
          { key: "experience", status: "required", maxWords: 200 },
          { key: "education", status: "required" },
        ],
      }),
    );

    expect(complains(problems, "word ceiling on experience")).toBe(true);
  });

  it("refuses a word ceiling that is not a count", () => {
    expect(
      complains(
        validateDocumentType(
          letterCandidate({
            sections: letterCandidate().sections.map((slot) =>
              slot.key === "body" ? { ...slot, maxWords: 0 } : slot,
            ),
          }),
        ),
        "word ceiling of 0",
      ),
    ).toBe(true);
    expect(
      complains(
        validateDocumentType(
          letterCandidate({
            sections: letterCandidate().sections.map((slot) =>
              slot.key === "body" ? { ...slot, maxWords: 1.5 } : slot,
            ),
          }),
        ),
        "word ceiling of 1.5",
      ),
    ).toBe(true);
  });

  it("refuses a target longer than the maximum", () => {
    expect(
      complains(
        validateDocumentType(candidate({ pageBudget: { target: 4, max: 2 } })),
        "aims for 4 pages but allows only 2",
      ),
    ).toBe(true);
  });

  it("refuses a page budget that is not a page count", () => {
    expect(
      complains(
        validateDocumentType(candidate({ pageBudget: { target: 0, max: 2 } })),
        "not a page count",
      ),
    ).toBe(true);
  });

  /** `null` is a real answer: an academic CV grows with a career and a ceiling would be wrong. */
  it("accepts a document with no page limit at all", () => {
    expect(validateDocumentType(candidate({ pageBudget: null }))).toEqual([]);
  });
});

describe("heading conventions", () => {
  it("accepts renaming a section the document shows", () => {
    expect(
      validateDocumentType(candidate({ headingOverrides: { experience: "Appointments" } })),
    ).toEqual([]);
  });

  /** Otherwise the convention is silently inert, which looks like a rendering bug. */
  it("refuses renaming a section the document does not show", () => {
    expect(
      complains(
        validateDocumentType(candidate({ headingOverrides: { publications: "Selected works" } })),
        "which it does not show",
      ),
    ).toBe(true);
  });

  it("refuses renaming a section to nothing", () => {
    expect(
      complains(
        validateDocumentType(candidate({ headingOverrides: { experience: "   " } })),
        "to nothing",
      ),
    ).toBe(true);
  });
});

describe("a reported problem", () => {
  it("says what is at fault and what kind of thing it is", () => {
    const problems = validateDocumentType(candidate({ key: "academic_cv", label: "" }));

    expect(problems).toHaveLength(1);
    expect(problems[0]?.scope).toBe("document_type");
    expect(problems[0]?.subject).toBe("academic_cv");
  });

  it("summarises readably, and to nothing when there is nothing wrong", () => {
    expect(describeCatalogueProblems([])).toBe("");
    expect(describeCatalogueProblems(validateDocumentType(candidate({ label: "" })))).toContain(
      "professional_cv:",
    );
  });
});
