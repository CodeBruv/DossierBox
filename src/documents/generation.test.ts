import { describe, expect, it } from "vitest";
import { compileStructuredDocumentContent } from "./content-compiler";
import {
  failureFromWritingOutcome,
  normalizeWritingOutput,
  normalizeWritingOutputs,
  orderGenerationWorkItems,
  type GenerationSectionMetadata,
  type GenerationEvidence,
  type GenerationWorkItem,
} from "./generation";
import type { WritingOutcome } from "@/writing/writing";

const evidence: GenerationEvidence[] = [
  { evidenceId: "evidence-1", sourceType: "experience", sourceRecordId: "experience-1", excerpt: "Built systems" },
];

const header = { name: "Ada Lovelace", headline: "Analyst", contacts: [] };

const section = (overrides: Partial<GenerationSectionMetadata> = {}): GenerationSectionMetadata => ({
  sectionKey: "summary",
  heading: "Career objective",
  layout: "prose",
  order: 1,
  ...overrides,
});

describe("normalizeWritingOutput", () => {
  it("maps prose output to a compiler-compatible prose section", () => {
    const result = normalizeWritingOutput({
      output: { kind: "prose", text: "A focused objective.", missing: [] },
      section: section(),
      header,
      selectedEvidence: evidence,
      provenance: { evidenceIds: ["evidence-1"], requirementIds: ["requirement-1"] },
    });

    expect(result).toEqual({
      ok: true,
      candidate: {
        header,
        sections: {
          summary: {
            key: "summary",
            heading: "Career objective",
            layout: "prose",
            body: { kind: "paragraphs", lines: ["A focused objective."] },
          },
        },
      },
      provenance: {
        summary: { evidenceIds: ["evidence-1"], requirementIds: ["requirement-1"] },
      },
    });
  });

  it("maps bullets to prose or inline catalogue layouts", () => {
    const prose = normalizeWritingOutput({
      output: { kind: "bullets", bullets: ["One", "Two"], missing: [] },
      section: section(),
      header,
      selectedEvidence: evidence,
    });
    const inline = normalizeWritingOutput({
      output: { kind: "bullets", bullets: ["TypeScript", "SQL"], missing: [] },
      section: section({ sectionKey: "languages", heading: "Languages", layout: "inline" }),
      header,
      selectedEvidence: evidence,
    });

    expect(prose.ok && prose.candidate.sections.summary).toMatchObject({
      layout: "prose",
      body: { kind: "bullets", lines: ["One", "Two"] },
    });
    expect(inline.ok && inline.candidate.sections.languages).toMatchObject({
      layout: "inline",
      items: ["TypeScript", "SQL"],
    });
  });

  it("maps fact revisions to entry targets", () => {
    const result = normalizeWritingOutput({
      output: { kind: "revisions", revisions: [{ factId: "fact-1", text: "Built reliable systems." }], missing: [] },
      section: section({ sectionKey: "experience", heading: "Experience", layout: "entries", entryTargets: {
        "fact-1": { title: "Analyst", subtitle: "Company", meta: "2024", url: null },
      } }),
      header,
      selectedEvidence: evidence,
    });

    expect(result.ok && result.candidate.sections.experience).toEqual({
      key: "experience",
      heading: "Experience",
      layout: "entries",
      entries: [{
        title: "Analyst",
        subtitle: "Company",
        meta: "2024",
        url: null,
        detail: { kind: "paragraphs", lines: ["Built reliable systems."] },
      }],
    });
  });

  it("rejects selection and findings because they are not document content", () => {
    for (const output of [
      { kind: "selection", selected: [], missing: [] } as const,
      { kind: "findings", findings: [], missing: [] } as const,
    ]) {
      const result = normalizeWritingOutput({ output, section: section(), header, selectedEvidence: evidence });
      expect(result).toMatchObject({ ok: false, failure: { kind: "response", retryable: false } });
    }
  });

  it("rejects provenance outside the selected Evidence set", () => {
    const result = normalizeWritingOutput({
      output: { kind: "prose", text: "Supported text.", missing: [] },
      section: section(),
      header,
      selectedEvidence: evidence,
      provenance: { evidenceIds: ["not-selected"] },
    });

    expect(result).toMatchObject({ ok: false, failure: { kind: "compiler", detail: ["not-selected"] } });
  });
});

describe("normalizeWritingOutputs and generation boundaries", () => {
  it("orders sections by metadata without mutating inputs", () => {
    const items = [
      { output: { kind: "prose", text: "Education.", missing: [] } as const, metadata: section({ sectionKey: "education", heading: "Education", order: 2 }), selectedEvidence: evidence },
      { output: { kind: "prose", text: "Objective.", missing: [] } as const, metadata: section({ order: 1 }), selectedEvidence: evidence },
    ];
    const before = structuredClone(items);
    const result = normalizeWritingOutputs({ header, sections: items });

    expect(result.ok && Object.keys(result.candidate.sections)).toEqual(["summary", "education"]);
    expect(items).toEqual(before);
  });

  it("produces a candidate accepted by the content compiler", () => {
    const result = normalizeWritingOutputs({
      header,
      sections: [{
        output: { kind: "prose", text: "A supported objective.", missing: [] },
        metadata: section(),
        selectedEvidence: evidence,
        provenance: { evidenceIds: ["evidence-1"] },
      }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected normalization to succeed");
    expect(compileStructuredDocumentContent({
      documentType: "professional_cv",
      specification: { documentType: "professional_cv", purpose: "Targeted CV" },
      selectedEvidence: evidence,
      content: result.candidate,
      provenance: result.provenance,
    })).toMatchObject({ ok: false });
  });

  it("preserves pinned specification revisions on ordered work items", () => {
    const items: GenerationWorkItem[] = [
      { sectionKey: "education", heading: "Education", layout: "entries", order: 2, workload: "resume_tailoring", specificationId: "spec-1", specificationRevision: 7, selectedEvidence: evidence },
      { sectionKey: "summary", heading: "Career objective", layout: "prose", order: 1, workload: "cover_letter_generation", specificationId: "spec-1", specificationRevision: 7, selectedEvidence: evidence },
    ];

    expect(orderGenerationWorkItems(items).map((item) => [item.sectionKey, item.specificationRevision])).toEqual([
      ["summary", 7],
      ["education", 7],
    ]);
  });
});

describe("failureFromWritingOutcome", () => {
  const base = {
    workload: "cover_letter_generation" as const,
    promptId: "cover_letter_generation@1",
    context: {} as WritingOutcome["context"],
    usage: {} as WritingOutcome["usage"],
  };

  it("maps insufficient context to a non-retryable Evidence failure", () => {
    expect(failureFromWritingOutcome({ ...base, status: "insufficient", missing: ["facts"] })).toMatchObject({ kind: "evidence", retryable: false });
  });

  it("maps transient provider failures as retryable and permanent failures as non-retryable", () => {
    expect(failureFromWritingOutcome({ ...base, status: "declined", cause: "provider", failure: "transient" })).toMatchObject({ kind: "provider", retryable: true });
    expect(failureFromWritingOutcome({ ...base, status: "declined", cause: "provider", failure: "rejected" })).toMatchObject({ kind: "provider", retryable: false });
  });

  it("keeps response and integrity failures distinct", () => {
    expect(failureFromWritingOutcome({ ...base, status: "declined", cause: "response", problem: "wrong_shape" })).toMatchObject({ kind: "response" });
    expect(failureFromWritingOutcome({ ...base, status: "declined", cause: "review", findings: [{ kind: "prompt_leak", detail: "marker" }] })).toMatchObject({ kind: "integrity" });
  });
});

