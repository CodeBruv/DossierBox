import { describe, expect, it } from "vitest";
import { compilePresentationModel, PRESENTATION_CONTRACT_VERSION, PresentationCompilationError } from "./export-presentation";
import type { ComposedDocument } from "./composition";

const document: ComposedDocument = {
  type: "professional_resume",
  header: { name: "Zoë Applicant", headline: "Engineer", contacts: ["zoe@example.com"] },
  sections: [
    { key: "experience", heading: "Experience", layout: "entries", entries: [{ title: "Senior Engineer", subtitle: "Acme", meta: "Jan 2020 · Current", detail: { kind: "bullets", lines: ["Built resilient systems"] }, url: "https://example.com" }] },
    { key: "skills", heading: "Skills", layout: "inline", items: ["TypeScript", "Unicode · safe"] },
  ],
};

describe("authoritative presentation-v1 compiler", () => {
  it("compiles a deterministic canonical model with pinned fonts and contract", () => {
    const first = compilePresentationModel({ document, presentationContractVersion: PRESENTATION_CONTRACT_VERSION, presentationStyleId: "compact" });
    const second = compilePresentationModel({ document, presentationContractVersion: PRESENTATION_CONTRACT_VERSION, presentationStyleId: "compact" });
    expect(second).toEqual(first);
    expect(first.contractVersion).toBe("presentation-v1");
    expect(first.typography.regularFont).toContain("open-sans-latin-ext-400-normal.woff");
    expect(first.typography.boldFont).toContain("open-sans-latin-ext-700-normal.woff");
    expect(first.paper.widthPoints).toBeCloseTo(612);
    expect(first.blocks.some((block) => block.kind === "link")).toBe(true);
    expect(first.blocks.map((block) => block.kind)).toEqual(["text", "text", "text", "text", "text", "text", "text", "bullet", "link", "text", "text", "text"]);
  });

  it("fails closed for unknown contracts, styles, and incompatible pairings", () => {
    expect(() => compilePresentationModel({ document, presentationContractVersion: "presentation-v2", presentationStyleId: "compact" })).toThrowError(PresentationCompilationError);
    expect(() => compilePresentationModel({ document, presentationContractVersion: "presentation-v1", presentationStyleId: "unknown" })).toThrowError(PresentationCompilationError);
    expect(() => compilePresentationModel({ document: { ...document, type: "professional_resume" }, presentationContractVersion: "presentation-v1", presentationStyleId: "constructor" })).toThrowError(PresentationCompilationError);
  });

  it("normalizes text without changing semantic block ordering", () => {
    const model = compilePresentationModel({ document: { ...document, header: { ...document.header, name: "  A\tB  " } }, presentationContractVersion: "presentation-v1", presentationStyleId: "compact" });
    expect(model.blocks[0]).toMatchObject({ kind: "text", text: "A B", role: "name" });
    expect(model.blocks.findIndex((block) => block.kind === "link")).toBeGreaterThan(model.blocks.findIndex((block) => block.kind === "text" && block.role === "heading"));
  });
});
