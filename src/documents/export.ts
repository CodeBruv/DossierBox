import "server-only";

import { compilePresentationModel, PresentationCompilationError, type PresentationContractVersion } from "./export-presentation";
import { renderPresentationPdf, PdfRenderError } from "./pdf-renderer";
import * as documentReads from "./read-composition";
import { PRESENTATION_CONTRACT_VERSION } from "./export-presentation";

export type ExportOwnedDocumentInput = {
  userId: string;
  documentId: string;
  documentVersionId?: string;
  format: "pdf";
};

export type ExportResult = { kind: "pdf"; bytes: Buffer; filename: string; contentType: "application/pdf"; version?: number } | { kind: "not_found" | "accepted-version-required" | "invalid-version" | "unsupported-presentation" };

export async function exportOwnedDocumentVersion(input: ExportOwnedDocumentInput): Promise<ExportResult> {
  if (input.format !== "pdf") return { kind: "unsupported-presentation" };
  if (!input.documentVersionId) {
    const readDraft = documentReads.readOwnedCurrentDraftComposition;
    if (typeof readDraft !== "function") {
      const legacyRead = await documentReads.readOwnedDocumentComposition(input.userId, input.documentId);
      if (legacyRead && legacyRead.kind === "not_found") return legacyRead;
      if (legacyRead && (legacyRead.kind === "legacy" || legacyRead.kind === "draft" || legacyRead.kind === "incomplete")) return { kind: "accepted-version-required" };
      return { kind: "accepted-version-required" };
    }
    const draft = await readDraft(input.userId, input.documentId);
    if (!draft) {
      const legacyRead = await documentReads.readOwnedDocumentComposition(input.userId, input.documentId);
      if (!legacyRead) return { kind: "accepted-version-required" };
      if (legacyRead.kind === "not_found") return legacyRead;
      return { kind: "accepted-version-required" };
    }
    if (draft.kind === "not_found") return draft;
    if (draft.kind === "legacy" || draft.kind === "incomplete") return { kind: "accepted-version-required" };
    if (draft.kind !== "draft") return { kind: "accepted-version-required" };

    try {
      const model = compilePresentationModel({ document: draft.composed, presentationContractVersion: PRESENTATION_CONTRACT_VERSION, presentationStyleId: draft.presentationStyle.id });
      const bytes = await renderPresentationPdf(model);
      return { kind: "pdf", bytes, filename: safeFilename(draft.document.title), contentType: "application/pdf" };
    } catch (error) {
      if (error instanceof PresentationCompilationError || error instanceof PdfRenderError) return { kind: "unsupported-presentation" };
      throw error;
    }
  }

  const read = await documentReads.readOwnedDocumentComposition(input.userId, input.documentId, input.documentVersionId);
  if (read.kind === "not_found") return read;
  if (read.kind === "legacy" || read.kind === "draft" || read.kind === "incomplete") return { kind: "accepted-version-required" };
  if (read.kind === "invalid_version") return read.reason === "version_not_found" ? { kind: "not_found" } : { kind: "invalid-version" };
  if (read.kind !== "version") return { kind: "accepted-version-required" };

  try {
    const model = compilePresentationModel({ document: read.composed, presentationContractVersion: read.presentationContractVersion, presentationStyleId: read.presentationStyle.id });
    const bytes = await renderPresentationPdf(model);
    return { kind: "pdf", bytes, filename: safeFilename(read.document.title, read.version), contentType: "application/pdf", version: read.version };
  } catch (error) {
    if (error instanceof PresentationCompilationError || error instanceof PdfRenderError) return { kind: "unsupported-presentation" };
    throw error;
  }
}

function safeFilename(title: string, version?: number) {
  const cleaned = title.normalize("NFC").replace(/[^\p{L}\p{N}._ -]+/gu, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "").slice(0, 80) || "document";
  return version === undefined ? `${cleaned}.pdf` : `${cleaned}-v${version}.pdf`;
}
