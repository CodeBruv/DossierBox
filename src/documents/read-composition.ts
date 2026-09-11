import "server-only";

import type { DocumentTypeKey } from "./catalogue";
import {
  composeEvidenceBoundDocument,
  composeStructuredDocument,
  evidenceBoundDossierSnapshot,
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
import { listValidPackageEvidenceSelections } from "@/applications/evidence-selection-repository";
import { listApplicationEvidence, listOwnedEvidenceByIds } from "@/applications/evidence-repository";
import { getDossierSnapshot } from "@/profile/repository";
import { getOwnedDocumentPackageMember, getOwnedDocumentReadSource } from "./repository";
import { listDocumentSpecifications } from "./specification-repository";
import type { DocumentType } from "./schema";
import type { DocumentVersionRow } from "./version-schema";

export type VersionBackedDocumentRead = {
  readonly kind: "version";
  readonly document: NonNullable<Awaited<ReturnType<typeof getOwnedDocumentReadSource>>>["document"];
  readonly documentVersionId: string;
  readonly version: number;
  readonly composed: ComposedDocument;
  readonly presentationStyle: PresentationStyle;
  readonly configuration: DocumentConfiguration;
  readonly presentationContractVersion: "presentation-v1";
  readonly createdAt: Date;
};

export type CurrentDraftDocumentRead = {
  readonly kind: "draft";
  readonly document: NonNullable<Awaited<ReturnType<typeof getOwnedDocumentReadSource>>>["document"];
  readonly composed: ComposedDocument;
  readonly presentationStyle: PresentationStyle;
  readonly selectedEvidence: readonly SelectedEvidence[];
  readonly snapshot: import("@/profile/dossier").DossierSnapshot;
};

export type IncompleteCurrentDraftRead = {
  readonly kind: "incomplete";
  readonly document: NonNullable<Awaited<ReturnType<typeof getOwnedDocumentReadSource>>>["document"];
  readonly reason: "unconfirmed-package" | "specification-required" | "evidence-required" | "stale-evidence" | "dossier-unavailable";
  readonly applicationId: string;
  readonly planId: string;
  readonly packageId: string;
};

export type DocumentReadComposition =
  | VersionBackedDocumentRead
  | {
      readonly kind: "legacy";
      readonly document: NonNullable<Awaited<ReturnType<typeof getOwnedDocumentReadSource>>>["document"];
    }
  | CurrentDraftDocumentRead
  | IncompleteCurrentDraftRead
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
/**
 * Resolves a current draft only through its attached, owner-authorized package member.
 * Missing or stale upstream state is returned as an incomplete draft rather than composed
 * from unrestricted Dossier data.
 */
export async function readOwnedCurrentDraftComposition(
  userId: string,
  documentId: string,
): Promise<DocumentReadComposition> {
  const document = await getOwnedDocumentReadSource(userId, documentId);
  if (!document) return { kind: "not_found" };
  if (document.state !== "legacy") return readOwnedDocumentComposition(userId, documentId);

  const context = await getOwnedDocumentPackageMember(userId, documentId);
  if (!context) return { kind: "legacy", document: document.document };
  const contextIds = {
    applicationId: context.application.id,
    planId: context.plan.id,
    packageId: context.package.id,
  } as const;
  if (context.plan.status !== "confirmed" || context.plan.confirmation !== "confirmed" || context.package.status !== "confirmed" || context.package.confirmation !== "confirmed") {
    return { kind: "incomplete", document: document.document, reason: "unconfirmed-package", ...contextIds };
  }

  const specifications = await listDocumentSpecifications(userId, context.member.id);
  const specification = specifications.find((candidate) => candidate.status === "approved" && candidate.documentType === document.document.type);
  if (!specification) {
    return { kind: "incomplete", document: document.document, reason: "specification-required", ...contextIds };
  }

  const selections = await listValidPackageEvidenceSelections(userId, context.application.id, context.package.id);
  if (!selections) return { kind: "incomplete", document: document.document, reason: "evidence-required", ...contextIds };
  const validSelections = selections;
  const evidenceState = resolveCurrentEvidenceState(validSelections, specification.requirementIds, specification.evidenceIds);
  if (evidenceState !== "valid") {
    return { kind: "incomplete", document: document.document, reason: evidenceState, ...contextIds };
  }

  const selectedEvidence: SelectedEvidence[] = [];
  if (specification.requirementIds.length === 0 && specification.evidenceIds.length === 0) {
    const baselineEvidence = await listApplicationEvidence(userId, context.application.id);
    for (const candidate of baselineEvidence) {
      if (candidate.lifecycle !== "active") continue;
      selectedEvidence.push({
        evidenceId: candidate.id,
        sourceType: candidate.sourceType,
        sourceRecordId: candidate.sourceRecordId,
      });
    }
  } else {
    const authorizedSelections = validSelections.filter((candidate) =>
      specification.evidenceIds.includes(candidate.evidenceId),
    );
    const evidenceById = new Map(
      (await listOwnedEvidenceByIds(userId, authorizedSelections.map((selection) => selection.evidenceId)))
        .map((evidence) => [evidence.id, evidence]),
    );
    for (const selection of authorizedSelections) {
      const evidence = evidenceById.get(selection.evidenceId);
      if (!evidence || evidence.lifecycle !== "active") return { kind: "incomplete", document: document.document, reason: "stale-evidence", ...contextIds };
      selectedEvidence.push({ evidenceId: evidence.id, sourceType: evidence.sourceType, sourceRecordId: evidence.sourceRecordId });
    }
  }

  const snapshot = await getDossierSnapshot(userId);
  if (!snapshot) return { kind: "incomplete", document: document.document, reason: "dossier-unavailable", ...contextIds };
  const presentationStyle = resolvePresentationStyle(document.document.template, document.document.type);
  return {
    kind: "draft",
    document: document.document,
    // A zero-Requirement specification uses the active, owner-scoped Evidence
    // projections already materialized for this Application as its baseline.
    composed: composeEvidenceBoundDocument(document.document.type, snapshot, selectedEvidence, {
      hiddenSections: document.document.hiddenSections,
      sectionOrder: document.document.sectionOrder,
    }),
    presentationStyle,
    selectedEvidence,
    snapshot: evidenceBoundDossierSnapshot(snapshot, selectedEvidence),
  };
}

/** Composes an accepted snapshot already loaded by a bounded history read. */
export function composeAcceptedVersionThumbnail(
  documentType: DocumentType,
  version: Pick<DocumentVersionRow, "specification" | "selectedEvidence" | "content" | "provenance" | "configuration">,
) {
  const specification = readSpecification(version.specification, documentType);
  const selectedEvidence = readSelectedEvidence(version.selectedEvidence);
  const configuration = readConfiguration(version.configuration, documentType);
  if (!specification || !selectedEvidence || !configuration) return null;
  const compilation = compileStructuredDocumentContent({
    documentType,
    specification,
    selectedEvidence,
    content: version.content,
    provenance: readProvenance(version.provenance),
  });
  if (!compilation.ok) return null;
  return {
    composed: composeStructuredDocument({
      documentType,
      specification,
      selectedEvidence,
      content: compilation.content,
      configuration: configuration.composition,
    }),
    presentationStyle: resolvePresentationStyle(configuration.presentationStyle, documentType),
  };
}

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
    presentationContractVersion: configuration.presentationContractVersion,
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
  presentationContractVersion: "presentation-v1";
  composition: DocumentConfiguration;
} | null {
  if (!isRecord(value)) return null;
  // Pre-contract accepted versions are compatible only when their complete historical
  // style/composition snapshot is present. This is a deterministic compatibility mapping;
  // no current Document configuration is consulted.
  const presentationContractVersion = value.presentationContractVersion === undefined
    ? "presentation-v1"
    : value.presentationContractVersion === "presentation-v1" ? "presentation-v1" : null;
  if (!presentationContractVersion) return null;
  const presentationStyle = value.presentationStyle;
  if (
    !isPresentationStyleId(presentationStyle) ||
    !presentationStyleSuitsType(presentationStyle, documentType)
  ) return null;
  if (!stringArray(value.hiddenSections) || !stringArray(value.sectionOrder)) return null;
  return {
    presentationStyle,
    presentationContractVersion,
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

/**
 * Classifies the current Evidence boundary without treating an empty selection
 * collection as a failure when the reviewed package has no Requirements.
 */
export function resolveCurrentEvidenceState(
  selections: readonly { evidenceId: string }[] | null,
  requirementIds: readonly string[],
  evidenceIds: readonly string[],
): "valid" | "evidence-required" | "stale-evidence" {
  if (!selections) return "evidence-required";
  if (requirementIds.length === 0 && evidenceIds.length === 0) return "valid";
  if (evidenceIds.some((id) => !selections.some((selection) => selection.evidenceId === id))) {
    return "stale-evidence";
  }
  if (requirementIds.length > 0 && evidenceIds.length === 0) return "evidence-required";
  return "valid";
}
