import "server-only";

import type { DocumentTypeKey } from "./catalogue";
import {
  composeStructuredDocument,
  type ComposedDocument,
  type DocumentConfiguration,
  type DocumentSpecificationSemantics,
  type SelectedEvidence,
} from "./composition";
import {
  compileStructuredDocumentContent,
  type CompilationIssue,
  type ContentProvenance,
} from "./content-compiler";
import {
  isPresentationStyleId,
  presentationStyleSuitsType,
  resolvePresentationStyle,
  type PresentationStyle,
} from "./presentation";
import { getOwnedDocumentReadSource } from "./repository";
import type { DocumentType } from "./schema";

export type VersionBackedDocumentRead = {
  readonly kind: "version";
  readonly document: NonNullable<Awaited<ReturnType<typeof getOwnedDocumentReadSource>>>["document"];
  readonly documentVersionId: string;
  readonly version: number;
  readonly composed: ComposedDocument;
  readonly presentationStyle: PresentationStyle;
  readonly configuration: DocumentConfiguration;
  readonly createdAt: Date;
};

export type DocumentReadComposition =
  | VersionBackedDocumentRead
  | {
      readonly kind: "legacy";
      readonly document: NonNullable<Awaited<ReturnType<typeof getOwnedDocumentReadSource>>>["document"];
    }
  | { readonly kind: "not_found" }
  | {
      readonly kind: "invalid_version";
      readonly reason:
        | "version_not_found"
        | "invalid_version_history"
        | "invalid_specification"
        | "invalid_evidence"
        | "invalid_configuration"
        | "invalid_content";
      readonly issues?: readonly CompilationIssue[];
    };

/**
 * Owner-safe, read-only handoff from immutable persistence to deterministic Composition.
 *
 * This function reads no Dossier, current Specification, current Evidence, Generation state,
 * entitlement, provider, IU, or billing data. An explicit version id is meaningful only inside
 * the already-authorized Document supplied alongside it.
 */
export async function readOwnedDocumentComposition(
  userId: string,
  documentId: string,
  documentVersionId?: string,
): Promise<DocumentReadComposition> {
  const source = await getOwnedDocumentReadSource(userId, documentId, documentVersionId);
  if (!source) return { kind: "not_found" };
  if (source.state === "legacy") return { kind: "legacy", document: source.document };
  if (source.state !== "version") return { kind: "invalid_version", reason: source.state };

  const specification = readSpecification(source.version.specification, source.document.type);
  if (!specification) return { kind: "invalid_version", reason: "invalid_specification" };
  const selectedEvidence = readSelectedEvidence(source.version.selectedEvidence);
  if (!selectedEvidence) return { kind: "invalid_version", reason: "invalid_evidence" };
  const configuration = readConfiguration(source.version.configuration, source.document.type);
  if (!configuration) return { kind: "invalid_version", reason: "invalid_configuration" };

  const compilation = compileStructuredDocumentContent({
    documentType: source.document.type,
    specification,
    selectedEvidence,
    content: source.version.content,
    provenance: readProvenance(source.version.provenance),
  });
  if (!compilation.ok) {
    return { kind: "invalid_version", reason: "invalid_content", issues: compilation.issues };
  }

  return {
    kind: "version",
    document: source.document,
    documentVersionId: source.version.id,
    version: source.version.version,
    composed: composeStructuredDocument({
      documentType: source.document.type,
      specification,
      selectedEvidence,
      content: compilation.content,
      configuration: configuration.composition,
    }),
    presentationStyle: resolvePresentationStyle(
      configuration.presentationStyle,
      source.document.type,
    ),
    configuration: configuration.composition,
    createdAt: source.version.createdAt,
  };
}

function readSpecification(
  value: unknown,
  documentType: DocumentTypeKey,
): DocumentSpecificationSemantics | null {
  if (!isRecord(value) || value.documentType !== documentType || !nonBlank(value.purpose)) return null;
  if (value.instructions != null && typeof value.instructions !== "string") return null;
  if (value.context != null && typeof value.context !== "string") return null;
  if (value.constraints != null && !isRecord(value.constraints)) return null;
  if (value.sectionExpectations != null && !isRecord(value.sectionExpectations)) return null;
  if (value.outputCharacteristics != null && !isRecord(value.outputCharacteristics)) return null;

  return {
    documentType,
    purpose: value.purpose,
    constraints: value.constraints ?? undefined,
    instructions: value.instructions as string | null | undefined,
    context: value.context as string | null | undefined,
    sectionExpectations: value.sectionExpectations ?? undefined,
    outputCharacteristics: value.outputCharacteristics ?? undefined,
  };
}

function readSelectedEvidence(value: unknown): readonly SelectedEvidence[] | null {
  if (!Array.isArray(value)) return null;
  const evidence: SelectedEvidence[] = [];
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      !nonBlank(candidate.evidenceId) ||
      !nonBlank(candidate.sourceType) ||
      !nonBlank(candidate.sourceRecordId)
    ) return null;
    evidence.push({
      evidenceId: candidate.evidenceId,
      sourceType: candidate.sourceType,
      sourceRecordId: candidate.sourceRecordId,
    });
  }
  return evidence;
}

function readConfiguration(value: unknown, documentType: DocumentType): {
  presentationStyle: string;
  composition: DocumentConfiguration;
} | null {
  if (!isRecord(value)) return null;
  const presentationStyle = value.presentationStyle;
  if (
    !isPresentationStyleId(presentationStyle) ||
    !presentationStyleSuitsType(presentationStyle, documentType)
  ) return null;
  if (!stringArray(value.hiddenSections) || !stringArray(value.sectionOrder)) return null;
  return {
    presentationStyle,
    composition: {
      hiddenSections: value.hiddenSections,
      sectionOrder: value.sectionOrder,
    },
  };
}

function readProvenance(value: unknown): Readonly<Record<string, ContentProvenance>> | undefined {
  if (!isRecord(value)) return undefined;
  const provenance: Record<string, ContentProvenance> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!isRecord(candidate)) continue;
    const evidenceIds = stringArray(candidate.evidenceIds) ? candidate.evidenceIds : undefined;
    const requirementIds = stringArray(candidate.requirementIds) ? candidate.requirementIds : undefined;
    provenance[key] = { evidenceIds, requirementIds };
  }
  return provenance;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
