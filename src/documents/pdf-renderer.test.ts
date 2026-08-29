import { describe, expect, it } from "vitest";
import { compilePresentationModel } from "./export-presentation";
import { renderPresentationPdf } from "./pdf-renderer";
import type { ComposedDocument } from "./composition";

const document: ComposedDocument = {
  type: "professional_cv",
  header: { name: "Zoë Applicant", headline: "Engineer", contacts: ["zoe@example.com"] },
  sections: [
    { key: "summary", heading: "Summary", layout: "prose", body: { kind: "paragraphs", lines: ["Unicode résumé text.", "A second paragraph."] } },
    { key: "links", heading: "Links", layout: "entries", entries: [{ title: "Portfolio", subtitle: null, meta: null, detail: null, url: "https://example.com" }] },
  ],
};

describe("authoritative PDF renderer", () => {
  it("renders a valid embedded-font PDF with controlled page metadata and links", async () => {
    const model = compilePresentationModel({ document, presentationContractVersion: "presentation-v1", presentationStyleId: "classic" });
    const pdf = await renderPresentationPdf(model);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).toContain("/Producer");
    expect(pdf.toString("latin1")).toContain("/Type /Font");
    expect(pdf.toString("latin1")).toContain("/Subtype /Link");
  });

  it("rejects an unbounded model before allocating renderer work", async () => {
    const model = compilePresentationModel({ document, presentationContractVersion: "presentation-v1", presentationStyleId: "classic" });
    await expect(renderPresentationPdf({ ...model, blocks: Array.from({ length: 10_001 }, () => model.blocks[0]!) })).rejects.toMatchObject({ reason: "resource-limit" });
  });
});
