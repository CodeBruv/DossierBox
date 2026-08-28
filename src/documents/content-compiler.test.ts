import { describe, expect, it } from "vitest";
import { composeStructuredDocument } from "./composition";
import {
  compileStructuredDocumentContent,
  type StructuredDocumentContentCompilerInput,
} from "./content-compiler";

const header = {
  name: "Ada Lovelace",
  headline: "Analyst",
  contacts: ["ada@example.com"],
};

const experience = {
  key: "experience",
  heading: "Experience",
  layout: "entries",
  entries: [
    {
      title: "Analyst",
      subtitle: "Company",
      meta: "2024",
      detail: { kind: "bullets", lines: ["Built reliable systems"] },
      url: null,
    },
  ],
} as const;

const education = {
  key: "education",
  heading: "Education",
  layout: "entries",
  entries: [
    {
      title: "Mathematics",
      subtitle: "University",
      meta: "2020",
      detail: null,
      url: null,
    },
  ],
} as const;

function input(overrides: Partial<StructuredDocumentContentCompilerInput> = {}) {
  return {
    documentType: "professional_cv" as const,
    specification: {
      documentType: "professional_cv" as const,
      purpose: "A targeted professional document",
    },
    selectedEvidence: [
      {
        evidenceId: "evidence-1",
        sourceType: "experience",
        sourceRecordId: "experience-1",
      },
    ],
    content: {
      header,
      sections: { experience, education },
    },
    ...overrides,
  } satisfies StructuredDocumentContentCompilerInput;
}

describe("compileStructuredDocumentContent", () => {
  it("normalizes valid content into a Composition-compatible value", () => {
    const result = compileStructuredDocumentContent(
      input({
        provenance: {
          experience: { evidenceIds: ["evidence-1"], requirementIds: ["requirement-1"] },
        },
      }),
    );

    expect(result).toEqual({
      ok: true,
      content: {
        header,
        sections: { experience, education },
      },
      provenance: [
        {
          sectionKey: "experience",
          evidenceIds: ["evidence-1"],
          requirementIds: ["requirement-1"],
        },
      ],
      warnings: [],
    });

    if (!result.ok) throw new Error("expected valid compilation");
    expect(
      composeStructuredDocument({
        documentType: "professional_cv",
        specification: input().specification,
        selectedEvidence: input().selectedEvidence,
        content: result.content,
      }).sections.map((section) => section.key),
    ).toEqual(["experience", "education"]);
  });

  it("rejects a specification for another document type", () => {
    const result = compileStructuredDocumentContent(
      input({
        specification: {
          documentType: "professional_resume",
          purpose: "A targeted professional document",
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      issues: [{ kind: "type_mismatch", path: "specification.documentType" }],
    });
  });

  it("rejects blank specifications and invalid selected Evidence", () => {
    const result = compileStructuredDocumentContent(
      input({
        specification: { documentType: "professional_cv", purpose: "  " },
        selectedEvidence: [
          { evidenceId: "", sourceType: "experience", sourceRecordId: "experience-1" },
        ],
      }),
    );

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      issues: [
        { kind: "invalid_specification", path: "specification.purpose" },
        { kind: "invalid_provenance", path: "selectedEvidence[0]" },
      ],
    });
  });

  it("rejects sections not permitted by the document catalogue", () => {
    const result = compileStructuredDocumentContent(
      input({
        content: {
          header,
          sections: {
            experience,
            education,
            body: {
              key: "body",
              heading: "Body",
              layout: "prose",
              body: { kind: "paragraphs", lines: ["Not a CV section"] },
            },
          },
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      issues: [{ kind: "unsupported_section", path: "content.sections.body" }],
    });
  });

  it("rejects a layout that disagrees with the catalogue", () => {
    const result = compileStructuredDocumentContent(
      input({
        content: {
          header,
          sections: {
            experience: {
              ...experience,
              layout: "prose",
              body: { kind: "paragraphs", lines: ["Wrong shape"] },
            },
            education,
          },
        },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected compilation to fail");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "unsupported_layout", path: "content.sections.experience.layout" }),
      ]),
    );
  });

  it("reports required sections with no valid content", () => {
    const result = compileStructuredDocumentContent(
      input({
        content: { header, sections: {} },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      issues: [
        { kind: "missing_content", path: "content.sections.experience" },
        { kind: "missing_content", path: "content.sections.education" },
      ],
    });
  });

  it("rejects invalid entries, blank values, and excessive lists", () => {
    const result = compileStructuredDocumentContent(
      input({
        content: {
          header: { ...header, contacts: [" "] },
          sections: {
            experience: {
              ...experience,
              entries: [{ ...experience.entries[0], title: " " }],
            },
            education,
          },
        },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected compilation to fail");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "invalid_content", path: "content.header.contacts[0]" }),
        expect.objectContaining({ kind: "invalid_content", path: "content.sections.experience.entries[0].title" }),
      ]),
    );
  });

  it("requires provenance to refer to selected Evidence", () => {
    const result = compileStructuredDocumentContent(
      input({
        provenance: {
          experience: { evidenceIds: ["not-selected"] },
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      issues: [{ kind: "invalid_provenance", path: "provenance.experience" }],
    });
  });

  it("is deterministic and does not mutate the candidate", () => {
    const candidate = input();
    const before = structuredClone(candidate);
    const first = compileStructuredDocumentContent(candidate);
    const second = compileStructuredDocumentContent(candidate);

    expect(first).toEqual(second);
    expect(candidate).toEqual(before);
  });
});

describe("catalogue layouts not yet representable by Composition", () => {
  it("reports correspondence field sections instead of accepting layout instructions", () => {
    const result = compileStructuredDocumentContent({
      documentType: "cover_letter",
      specification: { documentType: "cover_letter", purpose: "A letter" },
      selectedEvidence: [],
      content: {
        header,
        sections: {
          letter_date: {
            key: "letter_date",
            heading: "Date",
            layout: "field",
            value: "2024-01-01",
          },
        },
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected compilation to fail");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "unsupported_layout", path: "content.sections.letter_date.layout" }),
      ]),
    );
  });
});
