import "server-only";

import {
  documentSectionHeading,
  documentSectionSlots,
  documentSections,
  documentTypeFamily,
  documentTypeIsAvailable,
  documentTypeLabel,
  documentTypeMinPlan,
  getDocumentType,
  type DocumentSectionKey,
  type DocumentSectionLayout,
  type DocumentTypeKey,
  type ShippingDocumentTypeKey,
} from "./catalogue";
import {
  compileStructuredDocumentContent,
  type ContentProvenance,
  type StructuredDocumentContentCompilation,
  type StructuredDocumentContentCandidate,
} from "./content-compiler";
import {
  failureFromWritingOutcome,
  normalizeWritingOutputs,
  orderGenerationWorkItems,
  type GenerationEvidence,
  type GenerationFailure,
  type GenerationRequest,
  type GenerationSectionMetadata,
  type GenerationWorkItem,
} from "./generation";
import type { DocumentSpecificationSemantics, SelectedEvidence } from "./composition";
import {
  requirePlan,
  type AccessDecision,
  type Entitlement,
} from "@/entitlements/entitlements";
import { estimatedUnits, type WorkloadKind } from "@/entitlements/usage";
import {
  requestWriting,
  type WritingContextDraft,
  type WritingOptions,
  type WritingOutcome,
} from "../writing";
import type { WritingFact, WritingTarget } from "../writing/context";
import type { EvidenceSourceType } from "@/applications/planning-schema";

export type GenerationPersistence = {
  readonly prepare: (input: {
    readonly request: GenerationRequest;
    readonly specification: GenerationSpecification;
    readonly evidence: readonly GenerationEvidence[];
    readonly workItems: readonly GenerationWorkItem[];
    readonly entitlement: Entitlement;
    readonly now: Date;
  }) => Promise<{ readonly ok: true; readonly attemptId: string } | { readonly ok: false; readonly message: string }>;
  readonly recordWorkItemOutcome?: (input: {
    readonly userId: string;
    readonly attemptId: string;
    readonly item: GenerationWorkItem;
    readonly outcome: WritingOutcome;
    readonly sequence: number;
  }) => Promise<void>;
  readonly fail?: (input: {
    readonly userId: string;
    readonly attemptId: string;
    readonly failure: GenerationFailure;
  }) => Promise<void>;
  readonly succeed?: (input: {
    readonly userId: string;
    readonly attemptId: string;
    readonly candidate: StructuredDocumentContentCandidate;
    readonly provenance: Readonly<Record<string, ContentProvenance>>;
    readonly compilation: Extract<StructuredDocumentContentCompilation, { ok: true }>;
  }) => Promise<void>;
};

export type GenerationSpecification = DocumentSpecificationSemantics & {
  readonly id: string;
  readonly revision: number;
  readonly status: string;
  readonly evidenceIds: readonly string[];
  readonly requirementIds: readonly string[];
  readonly applicationId: string;
};

export type GenerationEvidenceRecord = {
  readonly evidenceId: string;
  readonly applicationId: string;
  readonly sourceType: EvidenceSourceType;
  readonly sourceRecordId: string;
  readonly excerpt: string | null;
  readonly lifecycle: string;
  readonly source: {
    readonly sourceType: EvidenceSourceType;
    readonly sourceRecordId: string;
    readonly searchableText: string;
  };
};

export type GenerationDependencies = {
  /** Must return the server-authenticated identity; request.userId is never used as proof. */
  readonly authenticate: (request: GenerationRequest) => Promise<string | null>;
  /** Must resolve the requested revision, never a latest revision fallback. */
  readonly getSpecification: (
    userId: string,
    specificationId: string,
    revision: number,
  ) => Promise<GenerationSpecification | null>;
  /** Must verify Application ownership and resolve each source without changing Evidence state. */
  readonly getEvidence: (
    userId: string,
    evidenceId: string,
  ) => Promise<GenerationEvidenceRecord | null>;
  readonly getHeader: (userId: string, applicationId: string) => Promise<unknown>;
  readonly getEntitlement: (userId: string, now: Date) => Promise<Entitlement>;
  readonly writing?: WritingOptions;
  readonly persistence?: GenerationPersistence;
  readonly now?: () => Date;
};

export type GenerationExecutionResult =
  | {
      readonly ok: true;
      readonly request: GenerationRequest;
      readonly workItems: readonly GenerationWorkItem[];
      readonly writing: readonly Extract<WritingOutcome, { status: "written" }>[];
      readonly candidate: StructuredDocumentContentCandidate;
      readonly provenance: Readonly<Record<string, ContentProvenance>>;
      readonly compilation: Extract<StructuredDocumentContentCompilation, { ok: true }>;
    }
  | {
      readonly ok: false;
      readonly request: GenerationRequest;
      readonly failure: GenerationFailure;
    };

const asFailure = (
  request: GenerationRequest,
  kind: GenerationFailure["kind"],
  message: string,
  detail?: readonly string[],
): GenerationExecutionResult => ({
  ok: false,
  request,
  failure: { kind, message, retryable: false, ...(detail ? { detail } : {}) },
});

export async function orchestrateGeneration(
  request: GenerationRequest,
  dependencies: GenerationDependencies,
): Promise<GenerationExecutionResult> {
  try {
    return await runGeneration(request, dependencies);
  } catch {
    return asFailure(request, "unexpected", "Generation could not be completed.");
  }
}

async function runGeneration(
  request: GenerationRequest,
  dependencies: GenerationDependencies,
): Promise<GenerationExecutionResult> {
  const authenticatedUserId = await dependencies.authenticate(request);
  if (!authenticatedUserId || authenticatedUserId !== request.userId) {
    return asFailure(request, "authorization", "The generation request is not authorized.");
  }
  if (!Number.isInteger(request.specificationRevision) || request.specificationRevision < 1) {
    return asFailure(request, "specification", "The requested specification revision is invalid.");
  }

  const now = dependencies.now?.() ?? new Date();
  const specification = await dependencies.getSpecification(
    authenticatedUserId,
    request.specificationId,
    request.specificationRevision,
  );
  if (!specification || specification.id !== request.specificationId || specification.revision !== request.specificationRevision) {
    return asFailure(request, "specification", "The requested Document Specification revision was not found.");
  }
  if (specification.status !== "approved") {
    return asFailure(request, "specification", "The Document Specification is not approved for generation.");
  }
  if (!documentTypeIsAvailable(specification.documentType)) {
    return asFailure(request, "specification", "This document type is not available for generation.");
  }

  const entitlement = await dependencies.getEntitlement(authenticatedUserId, now);
  const planDecision = requirePlan(entitlement, documentTypeMinPlan(specification.documentType));
  if (!planDecision.allowed) return asEntitlementFailure(request, planDecision);

  const selected = await resolveSelectedEvidence(
    authenticatedUserId,
    specification,
    dependencies.getEvidence,
  );
  if (!selected.ok) return asFailure(request, "evidence", selected.message, selected.detail);

  const type = getDocumentType(specification.documentType);
  if (type.sections.some((slot) => documentSections[slot.key].layout === "field")) {
    return asFailure(
      request,
      "specification",
      "This document type has sections that are not yet supported for generation.",
    );
  }
  const workItems = orderGenerationWorkItems(
    type.sections.map((slot, order) => makeWorkItem(
      specification,
      slot.key,
      documentSections[slot.key].layout,
      order,
      selected.evidence,
    )),
  );
  if (estimatedUnits(workItems.map((item) => item.workload)) <= 0) {
    return asFailure(request, "specification", "The specification produced no generation work.");
  }

  let attemptId: string | null = null;
  if (dependencies.persistence) {
    const prepared = await dependencies.persistence.prepare({
      request,
      specification,
      evidence: selected.evidence,
      workItems,
      entitlement,
      now,
    });
    if (!prepared.ok) return asFailure(request, "entitlement", prepared.message);
    attemptId = prepared.attemptId;
  }

  let header: unknown;
  try {
    header = await dependencies.getHeader(authenticatedUserId, specification.applicationId);
  } catch {
    const failure: GenerationFailure = { kind: "unexpected", message: "Generation could not be completed.", retryable: false };
    if (attemptId && dependencies.persistence?.fail) await dependencies.persistence.fail({ userId: authenticatedUserId, attemptId, failure });
    return { ok: false, request, failure };
  }
  const writingResults: {
    metadata: GenerationSectionMetadata;
    output: Extract<WritingOutcome, { status: "written" }> extends { output: infer T } ? T : never;
    selectedEvidence: readonly GenerationEvidence[];
    provenance: ContentProvenance;
  }[] = [];
  const written: Extract<WritingOutcome, { status: "written" }>[] = [];

  for (const item of workItems) {
    let outcome: WritingOutcome;
    try {
      outcome = await requestWriting(
        contextFor(item, specification),
        { userId: authenticatedUserId, plan: entitlement.plan, applicationId: specification.applicationId },
        dependencies.writing,
      );
    } catch {
      const failure: GenerationFailure = { kind: "unexpected", message: "Generation could not be completed.", retryable: false };
      if (attemptId && dependencies.persistence?.fail) await dependencies.persistence.fail({ userId: authenticatedUserId, attemptId, failure });
      return { ok: false, request, failure };
    }
    if (attemptId && dependencies.persistence?.recordWorkItemOutcome) {
      await dependencies.persistence.recordWorkItemOutcome({
        userId: authenticatedUserId,
        attemptId,
        item,
        outcome,
        sequence: item.order + 1,
      });
    }
    if (outcome.status !== "written") {
      const writingFailure = failureFromWritingOutcome(outcome);
      const result = asFailure(request, writingFailure.kind, writingFailure.message, writingFailure.detail);
      if (attemptId && dependencies.persistence?.fail) {
        await dependencies.persistence.fail({ userId: authenticatedUserId, attemptId, failure: writingFailure });
      }
      return result;
    }
    written.push(outcome);
    writingResults.push({
      metadata: { sectionKey: item.sectionKey, heading: item.heading, layout: item.layout, order: item.order, entryTargets: entryTargets(item) },
      output: outcome.output,
      selectedEvidence: item.selectedEvidence,
      provenance: { evidenceIds: item.selectedEvidence.map((evidence) => evidence.evidenceId), requirementIds: specification.requirementIds },
    });
  }

  const normalized = normalizeWritingOutputs({ header, sections: writingResults });
  if (!normalized.ok) {
    const result = asFailure(request, normalized.failure.kind, normalized.failure.message, normalized.failure.detail);
    if (attemptId && dependencies.persistence?.fail) {
      await dependencies.persistence.fail({ userId: authenticatedUserId, attemptId, failure: normalized.failure });
    }
    return result;
  }

  const selectedEvidence: readonly SelectedEvidence[] = selected.evidence.map(({ evidenceId, sourceType, sourceRecordId }) => ({ evidenceId, sourceType, sourceRecordId }));
  const compilation = compileStructuredDocumentContent({
    documentType: specification.documentType,
    specification: semanticsOf(specification),
    selectedEvidence,
    content: normalized.candidate,
    provenance: normalized.provenance,
  });
  if (!compilation.ok) {
    const compilerFailure: GenerationFailure = {
      kind: "compiler",
      message: "Generated content failed structured document compilation.",
      retryable: false,
      detail: compilation.issues.map((issue) => issue.kind),
    };
    if (attemptId && dependencies.persistence?.fail) {
      await dependencies.persistence.fail({ userId: authenticatedUserId, attemptId, failure: compilerFailure });
    }
    return { ok: false, request, failure: compilerFailure };
  }

  if (attemptId && dependencies.persistence?.succeed) {
    await dependencies.persistence.succeed({
      userId: authenticatedUserId,
      attemptId,
      candidate: normalized.candidate,
      provenance: normalized.provenance,
      compilation,
    });
  }
  return { ok: true, request, workItems, writing: written, candidate: normalized.candidate, provenance: normalized.provenance, compilation };
}

async function resolveSelectedEvidence(
  userId: string,
  specification: GenerationSpecification,
  getEvidence: GenerationDependencies["getEvidence"],
): Promise<{ ok: true; evidence: readonly GenerationEvidence[] } | { ok: false; message: string; detail?: readonly string[] }> {
  const uniqueIds = [...new Set(specification.evidenceIds)];
  const records = await Promise.all(uniqueIds.map((id) => getEvidence(userId, id)));
  if (records.some((record) => !record)) return { ok: false, message: "Selected Evidence is unavailable." };
  const valid = records.filter((record): record is GenerationEvidenceRecord => record !== null);
  if (valid.some((record) => record.applicationId !== specification.applicationId || record.lifecycle !== "active")) {
    return { ok: false, message: "Selected Evidence is stale or belongs to another Application." };
  }
  if (valid.some((record) => record.source.sourceType !== record.sourceType || record.source.sourceRecordId !== record.sourceRecordId)) {
    return { ok: false, message: "Selected Evidence source integrity could not be verified." };
  }
  return {
    ok: true,
    evidence: valid.map((record) => ({
      evidenceId: record.evidenceId,
      sourceType: record.sourceType,
      sourceRecordId: record.sourceRecordId,
      excerpt: (record.excerpt ?? record.source.searchableText).trim().slice(0, 1_000),
    })),
  };
}

function makeWorkItem(
  specification: GenerationSpecification,
  sectionKey: DocumentSectionKey,
  layout: DocumentSectionLayout,
  order: number,
  selectedEvidence: readonly GenerationEvidence[],
): GenerationWorkItem {
  return {
    sectionKey,
    heading: documentSectionHeading(specification.documentType, sectionKey),
    layout,
    order,
    workload: workloadFor(layout),
    specificationId: specification.id,
    specificationRevision: specification.revision,
    selectedEvidence,
  };
}

function workloadFor(layout: DocumentSectionLayout): WorkloadKind {
  if (layout === "entries") return "resume_tailoring";
  if (layout === "prose") return "cover_letter_generation";
  return "achievement_reframing";
}

function contextFor(item: GenerationWorkItem, specification: GenerationSpecification): WritingContextDraft {
  return {
    workload: item.workload,
    purpose: {
      objective: specification.purpose,
      document: documentTypeLabel(specification.documentType),
      family: documentTypeFamily(specification.documentType).label,
    },
    facts: item.selectedEvidence.map((evidence): WritingFact => ({
      id: evidence.evidenceId,
      label: `${evidence.sourceType} (${evidence.sourceRecordId})`,
      value: evidence.excerpt,
    })),
    section: { key: item.sectionKey, heading: item.heading, layout: writingLayout(item.layout) },
    notes: [specification.context, specification.instructions, JSON.stringify(specification.sectionExpectations)].filter(Boolean).join("\n") || null,
    target: writingTarget(specification),
  };
}

function writingLayout(layout: DocumentSectionLayout): "prose" | "bullets" | "entries" {
  return layout === "entries" ? "entries" : layout === "prose" ? "prose" : "bullets";
}

function writingTarget(specification: GenerationSpecification): Partial<WritingTarget> {
  return { role: specification.purpose.slice(0, 200) };
}

function entryTargets(item: GenerationWorkItem): Readonly<Record<string, { title: string; subtitle: string; meta: string }>> | undefined {
  if (item.layout !== "entries") return undefined;
  return Object.fromEntries(item.selectedEvidence.map((evidence) => [evidence.evidenceId, {
    title: evidence.excerpt.slice(0, 200) || evidence.sourceType,
    subtitle: evidence.sourceType,
    meta: evidence.sourceRecordId,
  }]));
}

function semanticsOf(specification: GenerationSpecification): DocumentSpecificationSemantics {
  return {
    documentType: specification.documentType,
    purpose: specification.purpose,
    constraints: specification.constraints,
    instructions: specification.instructions,
    context: specification.context,
    sectionExpectations: specification.sectionExpectations,
    outputCharacteristics: specification.outputCharacteristics,
  };
}

function asEntitlementFailure(request: GenerationRequest, decision: AccessDecision): GenerationExecutionResult {
  return asFailure(request, "entitlement", decision.allowed ? "" : `Generation entitlement denied: ${decision.reason}.`, decision.allowed ? undefined : decision.requiredPlan ? [decision.requiredPlan] : undefined);
}

export type { ShippingDocumentTypeKey };
