import "server-only";

import { compilePresentationModel, PresentationCompilationError, type PresentationContractVersion } from "./export-presentation";
import { renderPresentationPdf, PdfRenderError } from "./pdf-renderer";
import { readOwnedDocumentComposition } from "./read-composition";

export type ExportOwnedDocumentInput = {
  userId: string;
  documentId: string;
  documentVersionId?: string;
  format: "pdf";
};

export type ExportResult = { kind: "pdf"; bytes: Buffer; filename: string; contentType: "application/pdf"; version: number } | { kind: "not_found" | "accepted-version-required" | "invalid-version" | "unsupported-presentation" };

export async function exportOwnedDocumentVersion(input: ExportOwnedDocumentInput): Promise<ExportResult> {
  if (input.format !== "pdf") return { kind: "unsupported-presentation" };
  const read = await readOwnedDocumentComposition(input.userId, input.documentId, input.documentVersionId);
  if (read.kind === "not_found") return read;
  if (read.kind === "legacy") return { kind: "accepted-version-required" };
  if (read.kind === "invalid_version") return read.reason === "version_not_found" ? { kind: "not_found" } : { kind: "invalid-version" };

  try {
    const model = compilePresentationModel({ document: read.composed, presentationContractVersion: read.presentationContractVersion, presentationStyleId: read.presentationStyle.id });
    const bytes = await renderPresentationPdf(model);
    return { kind: "pdf", bytes, filename: safeFilename(read.document.title, read.version), contentType: "application/pdf", version: read.version };
  } catch (error) {
    if (error instanceof PresentationCompilationError || error instanceof PdfRenderError) return { kind: "unsupported-presentation" };
    throw error;
  }
}

function safeFilename(title: string, version: number) {
  const cleaned = title.normalize("NFC").replace(/[^\p{L}\p{N}._ -]+/gu, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "").slice(0, 80) || "document";
  return `${cleaned}-v${version}.pdf`;
}
