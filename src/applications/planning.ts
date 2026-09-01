import type { ApplicationObjective } from "./objective";
import { documentSetForObjective } from "./index";
import {
  documentTypeRegistry,
  type DocumentTypeKey,
} from "@/documents/catalogue";
import type {
  InterpretedRequestedDocument,
  OpportunityInterpretation,
} from "./opportunity-interpretation-response";

export type PlanningCounts = {
  requirements: number;
  evidence: number;
  openGaps: number;
};

export type ProposalReason = "application" | "opportunity_explicit";

export type PlanPackageMember = {
  documentType: DocumentTypeKey;
  role: "primary" | "supporting";
  position: number;
  availability: "available" | "unavailable";
  reason?: ProposalReason;
  rationale?: string;
  sourceReference?: string;
};

export type DeterministicPlanProposal = {
  resolutionSource: "deterministic";
  status: "proposed";
  confirmation: "unconfirmed";
  recommendedDocuments: DocumentTypeKey[];
  requirementCoverage: { total: number };
  evidenceCoverage: { total: number };
  gapsSummary: { open: number };
  packageMembers: PlanPackageMember[];
  advisoryDocuments?: readonly InterpretedRequestedDocument[];
  unsupportedDocuments?: readonly InterpretedRequestedDocument[];
  constrainedDocuments?: readonly InterpretedRequestedDocument[];
  warnings?: readonly string[];
  constrained?: boolean;
};

export type HybridPlanningInput = PlanningCounts & {
  interpretation?: OpportunityInterpretation | null;
  maxPackageSize?: number;
};

const documentRequestAliases: Readonly<Record<string, DocumentTypeKey>> = {
  cv: "professional_cv",
  resume: "professional_resume",
  résumé: "professional_resume",
  "professional cv": "professional_cv",
  "professional resume": "professional_resume",
  "professional résumé": "professional_resume",
  "academic cv": "academic_cv",
  "international cv": "academic_cv",
  "cover letter": "cover_letter",
  "motivation letter": "motivation_letter",
  "research statement": "research_statement",
};

export function documentTypeForExplicitRequest(name: string): DocumentTypeKey | null {
  const normalized = name.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  return documentRequestAliases[normalized] ?? null;
}

/** Pure baseline planning. Existing callers keep the objective-only contract. */
export function resolveDeterministicApplicationPlan(
  objective: ApplicationObjective,
  counts: PlanningCounts,
): DeterministicPlanProposal {
  const set = documentSetForObjective(objective);
  return {
    resolutionSource: "deterministic",
    status: "proposed",
    confirmation: "unconfirmed",
    recommendedDocuments: set.members.map((member) => member.type),
    requirementCoverage: { total: counts.requirements },
    evidenceCoverage: { total: counts.evidence },
    gapsSummary: { open: counts.openGaps },
    packageMembers: set.members.map((member, position) => ({
      documentType: member.type,
      role: member.role,
      position,
      availability: member.available ? "available" : "unavailable",
    })),
  };
}

/**
 * Constrained hybrid recommendation. Application Intent always supplies the baseline;
 * only explicit, unambiguous, catalogue-backed requests may add package members.
 */
export function resolveHybridApplicationPlan(
  objective: ApplicationObjective,
  input: HybridPlanningInput,
): DeterministicPlanProposal {
  const baseline = resolveDeterministicApplicationPlan(objective, input);
  const members: PlanPackageMember[] = baseline.packageMembers.map((member) => ({
    ...member,
    reason: "application",
    rationale: "Recommended because of your application purpose.",
  }));
  const advisoryDocuments = input.interpretation?.requestedDocuments.filter(
    (item) => item.support === "inferred",
  ) ?? [];
  const unsupportedDocuments: InterpretedRequestedDocument[] = [];
  const constrainedDocuments: InterpretedRequestedDocument[] = [];
  const maxPackageSize = input.maxPackageSize ?? Number.POSITIVE_INFINITY;
  let objectiveConflict = false;

  for (const request of input.interpretation?.requestedDocuments ?? []) {
    if (request.support !== "explicit") continue;
    const documentType = documentTypeForExplicitRequest(request.name);
    if (!documentType) {
      unsupportedDocuments.push(request);
      continue;
    }
    const existing = members.find((member) => member.documentType === documentType);
    if (existing) {
      existing.rationale = "Recommended because of your application purpose and explicitly requested by the opportunity.";
      existing.sourceReference = request.sourceReference;
      continue;
    }
    if (members.length >= maxPackageSize) {
      constrainedDocuments.push(request);
      continue;
    }
    const definition = documentTypeRegistry[documentType];
    if (
      (documentType === "professional_cv" || documentType === "professional_resume" || documentType === "academic_cv")
      && members.some((member) => member.documentType === "professional_cv" || member.documentType === "professional_resume" || member.documentType === "academic_cv")
    ) {
      objectiveConflict = true;
    }
    members.push({
      documentType,
      role: "supporting",
      position: members.length,
      availability: definition.availability === "shipping" ? "available" : "unavailable",
      reason: "opportunity_explicit",
      rationale: "The opportunity explicitly requests this document.",
      sourceReference: request.sourceReference,
    });
  }

  const warnings: string[] = [];
  if (objectiveConflict) warnings.push("An explicit opportunity request differs from the Application Intent baseline; both remain visible for your decision.");
  if (unsupportedDocuments.length > 0) warnings.push("Some explicit opportunity requests do not map to a supported or planned DossierBox document type.");
  if (constrainedDocuments.length > 0) warnings.push("Some supported opportunity requests exceed this package's document limit and were not included.");

  return {
    ...baseline,
    recommendedDocuments: members.map((member) => member.documentType),
    packageMembers: members,
    advisoryDocuments,
    unsupportedDocuments,
    constrainedDocuments,
    warnings,
    constrained: constrainedDocuments.length > 0,
  };
}
