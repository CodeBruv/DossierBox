import type { WorkloadKind } from "@/entitlements/usage";
import type { DocumentSectionKey, DocumentSectionLayout } from "./catalogue";
import type { ContentProvenance, StructuredDocumentContentCandidate } from "./content-compiler";
import type { ProviderFailure } from "@/writing/provider";
import type { WritingFinding } from "@/writing/integrity";
import type { WritingOutput } from "@/writing/response";
import type { WritingOutcome } from "@/writing/writing";

/** Identity that pins a generation to one immutable specification revision. */
export type GenerationRequest = {
  readonly userId: string;
  readonly specificationId: string;
  readonly specificationRevision: number;
};

/** The only Evidence representation that may cross into generation context. */
export type GenerationEvidence = {
  readonly evidenceId: string;
  readonly sourceType: string;
  readonly sourceRecordId: string;
  readonly excerpt: string;
};

/** A deterministic, section-sized unit of provider work. */
export type GenerationWorkItem = {
  readonly sectionKey: DocumentSectionKey;
  readonly heading: string;
  readonly layout: DocumentSectionLayout;
  readonly order: number;
  readonly workload: WorkloadKind;
  readonly specificationId: string;
  readonly specificationRevision: number;
  readonly selectedEvidence: readonly GenerationEvidence[];
};

/** Metadata needed to turn a writing result into one compiler section. */
export type GenerationSectionMetadata = {
  readonly sectionKey: DocumentSectionKey;
  readonly heading: string;
  readonly layout: DocumentSectionLayout;
  readonly order: number;
  readonly entryTargets?: Readonly<Record<string, GenerationEntryTarget>>;
};

export type GenerationEntryTarget = {
  readonly title: string;
  readonly subtitle?: string | null;
  readonly meta?: string | null;
  readonly url?: string | null;
};

export const generationFailureKinds = [
  "authorization",
  "specification",
  "evidence",
  "entitlement",
  "provider",
  "response",
  "integrity",
  "compiler",
  "unexpected",
] as const;

export type GenerationFailureKind = (typeof generationFailureKinds)[number];

export type GenerationFailure = {
  readonly kind: GenerationFailureKind;
  readonly message: string;
  readonly retryable: boolean;
  readonly detail?: readonly string[];
};

export type GenerationNormalization =
  | {
      readonly ok: true;
      readonly candidate: StructuredDocumentContentCandidate;
      readonly provenance: Readonly<Record<string, ContentProvenance>>;
    }
  | {
      readonly ok: false;
      readonly failure: GenerationFailure;
    };

export type GenerationResult =
  | {
      readonly ok: true;
      readonly request: GenerationRequest;
      readonly candidate: StructuredDocumentContentCandidate;
      readonly provenance: Readonly<Record<string, ContentProvenance>>;
    }
  | {
      readonly ok: false;
      readonly request: GenerationRequest;
      readonly failure: GenerationFailure;
    };

const failure = (
  kind: GenerationFailureKind,
  message: string,
  detail?: readonly string[],
): GenerationNormalization => ({
  ok: false,
  failure: { kind, message, retryable: false, ...(detail ? { detail } : {}) },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isGenerationFailure = (value: Record<string, unknown> | GenerationFailure): value is GenerationFailure =>
  typeof value.kind === "string" && generationFailureKinds.includes(value.kind as GenerationFailureKind);

const isNonBlank = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const validEvidenceIds = (selectedEvidence: readonly GenerationEvidence[]): ReadonlySet<string> =>
  new Set(selectedEvidence.map((evidence) => evidence.evidenceId));

function validateProvenance(
  provenance: ContentProvenance | undefined,
  selectedEvidence: readonly GenerationEvidence[],
): GenerationFailure | null {
  if (!provenance) return null;

  const evidenceIds = validEvidenceIds(selectedEvidence);
  const unknown = (provenance.evidenceIds ?? []).find((id) => !evidenceIds.has(id));
  if (unknown) {
    return {
      kind: "compiler",
      message: "Content provenance references Evidence outside the selected set.",
      retryable: false,
      detail: [unknown],
    };
  }

  if ((provenance.requirementIds ?? []).some((id) => !isNonBlank(id))) {
    return {
      kind: "compiler",
      message: "Content provenance contains a blank Requirement identifier.",
      retryable: false,
    };
  }

  return null;
}

function sectionCandidate(
  metadata: GenerationSectionMetadata,
  output: WritingOutput,
): Record<string, unknown> | GenerationFailure {
  const base = { key: metadata.sectionKey, heading: metadata.heading };

  if (output.kind === "prose") {
    if (metadata.layout !== "prose") {
      return { kind: "response", message: "Prose output cannot populate this section layout.", retryable: false };
    }
    return { ...base, layout: "prose", body: { kind: "paragraphs", lines: [output.text] } };
  }

  if (output.kind === "bullets") {
    if (metadata.layout === "prose") {
      return { ...base, layout: "prose", body: { kind: "bullets", lines: [...output.bullets] } };
    }
    if (metadata.layout === "inline") {
      return { ...base, layout: "inline", items: [...output.bullets] };
    }
    return { kind: "response", message: "Bullets output cannot populate this section layout.", retryable: false };
  }

  if (output.kind === "revisions") {
    if (metadata.layout !== "entries" || !metadata.entryTargets) {
      return { kind: "response", message: "Revision output requires entry section metadata.", retryable: false };
    }

    const entries: Record<string, unknown>[] = [];
    for (const revision of output.revisions) {
      const target = metadata.entryTargets[revision.factId];
      if (!target) {
        return { kind: "response", message: `No entry target exists for fact ${revision.factId}.`, retryable: false };
      }
      entries.push({
        ...target,
        detail: { kind: "paragraphs", lines: [revision.text] },
      });
    }
    return { ...base, layout: "entries", entries };
  }

  return {
    kind: "response",
    message: `${output.kind} output is not document content.`,
    retryable: false,
  };
}

/**
 * Normalize one accepted writing result into a compiler candidate containing one section.
 * This function is pure and does not call a provider, read persistence, or mutate its inputs.
 */
export function normalizeWritingOutput(input: {
  readonly output: WritingOutput;
  readonly section: GenerationSectionMetadata;
  readonly header: unknown;
  readonly selectedEvidence: readonly GenerationEvidence[];
  readonly provenance?: ContentProvenance;
}): GenerationNormalization {
  const provenanceFailure = validateProvenance(input.provenance, input.selectedEvidence);
  if (provenanceFailure) return { ok: false, failure: provenanceFailure };

  const normalized = sectionCandidate(input.section, input.output);
  if (isGenerationFailure(normalized)) {
    return { ok: false, failure: normalized };
  }

  return {
    ok: true,
    candidate: { header: input.header, sections: { [input.section.sectionKey]: normalized } },
    provenance: input.provenance ? { [input.section.sectionKey]: input.provenance } : {},
  };
}

/** Normalize ordered section results into one deterministic candidate. */
export function normalizeWritingOutputs(input: {
  readonly header: unknown;
  readonly sections: readonly {
    readonly metadata: GenerationSectionMetadata;
    readonly output: WritingOutput;
    readonly provenance?: ContentProvenance;
    readonly selectedEvidence: readonly GenerationEvidence[];
  }[];
}): GenerationNormalization {
  const ordered = [...input.sections].sort((left, right) => left.metadata.order - right.metadata.order);
  const sections: Record<string, unknown> = {};
  const provenance: Record<string, ContentProvenance> = {};

  for (const item of ordered) {
    if (Object.hasOwn(sections, item.metadata.sectionKey)) {
      return failure("response", `Duplicate section ${item.metadata.sectionKey}.`);
    }
    const result = normalizeWritingOutput({
      output: item.output,
      section: item.metadata,
      header: input.header,
      selectedEvidence: item.selectedEvidence,
      provenance: item.provenance,
    });
    if (!result.ok) return result;
    Object.assign(sections, result.candidate.sections);
    Object.assign(provenance, result.provenance);
  }

  return { ok: true, candidate: { header: input.header, sections }, provenance };
}

/** Map the existing writing primitive's outcomes into the generation failure taxonomy. */
export function failureFromWritingOutcome(outcome: Exclude<WritingOutcome, { status: "written" }>): GenerationFailure {
  switch (outcome.status) {
    case "insufficient":
      return { kind: "evidence", message: "Writing context does not satisfy the workload requirements.", retryable: false, detail: outcome.missing };
    case "declined":
      return outcome.cause === "provider"
        ? providerFailure(outcome.failure)
        : outcome.cause === "review"
          ? { kind: "integrity", message: "Generated writing failed factual-integrity review.", retryable: false, detail: outcome.findings.map((finding: WritingFinding) => finding.kind) }
          : { kind: "response", message: "Provider output did not satisfy the writing response contract.", retryable: false, detail: [outcome.problem] };
  }
}

function providerFailure(provider: ProviderFailure): GenerationFailure {
  return {
    kind: "provider",
    message: `Provider failure: ${provider}.`,
    retryable: provider === "timeout" || provider === "transient",
    detail: [provider],
  };
}

/** Preserve a pinned revision while ordering work items for deterministic orchestration. */
export function orderGenerationWorkItems(items: readonly GenerationWorkItem[]): readonly GenerationWorkItem[] {
  return [...items].sort((left, right) => left.order - right.order);
}

export type { ProviderFailure, WritingFinding, WritingOutput };
