import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComposedDocument } from "./composition";

const readOwnedDocumentComposition = vi.fn();
const renderPresentationPdf = vi.fn();
vi.mock("./read-composition", () => ({ readOwnedDocumentComposition }));
vi.mock("./pdf-renderer", () => ({ renderPresentationPdf }));

const { exportOwnedDocumentVersion } = await import("./export");

const composed: ComposedDocument = {
  type: "professional_resume",
  header: { name: "Applicant", headline: null, contacts: [] },
  sections: [],
};

beforeEach(() => {
  readOwnedDocumentComposition.mockReset();
  renderPresentationPdf.mockReset().mockResolvedValue(Buffer.from("%PDF-test"));
});

describe("authoritative document export boundary", () => {
  it("rejects legacy documents without invoking composition or rendering", async () => {
    readOwnedDocumentComposition.mockResolvedValue({ kind: "legacy", document: { title: "Legacy" } });
    await expect(exportOwnedDocumentVersion({ userId: "owner", documentId: "doc", format: "pdf" })).resolves.toEqual({ kind: "accepted-version-required" });
    expect(renderPresentationPdf).not.toHaveBeenCalled();
  });

  it("exports only the immutable version-backed composition and returns safe metadata", async () => {
    readOwnedDocumentComposition.mockResolvedValue({
      kind: "version",
      document: { title: "A dangerous/ résumé" },
      documentVersionId: "version-2",
      version: 2,
      composed,
      presentationStyle: { id: "compact" },
      configuration: { hiddenSections: [], sectionOrder: [] },
      presentationContractVersion: "presentation-v1",
      createdAt: new Date(0),
    });
    const result = await exportOwnedDocumentVersion({ userId: "owner", documentId: "doc", documentVersionId: "version-2", format: "pdf" });
    expect(result).toMatchObject({ kind: "pdf", version: 2, contentType: "application/pdf", filename: "A dangerous résumé-v2.pdf" });
    expect(readOwnedDocumentComposition).toHaveBeenCalledWith("owner", "doc", "version-2");
    expect(renderPresentationPdf).toHaveBeenCalledTimes(1);
  });

  it("maps an owner-safe missing document to neutral not-found", async () => {
    readOwnedDocumentComposition.mockResolvedValue({ kind: "not_found" });
    await expect(exportOwnedDocumentVersion({ userId: "owner", documentId: "guessed", format: "pdf" })).resolves.toEqual({ kind: "not_found" });
    expect(renderPresentationPdf).not.toHaveBeenCalled();
  });
});
