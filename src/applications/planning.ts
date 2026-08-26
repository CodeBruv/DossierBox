import type { ApplicationObjective } from "./objective";
import { documentSetForObjective } from "./index";
import type { DocumentTypeKey } from "@/documents/catalogue";

export type PlanningCounts = {
  requirements: number;
  evidence: number;
  openGaps: number;
};

export type DeterministicPlanProposal = {
  resolutionSource: "deterministic";
  status: "proposed";
  confirmation: "unconfirmed";
  recommendedDocuments: DocumentTypeKey[];
  requirementCoverage: { total: number };
  evidenceCoverage: { total: number };
  gapsSummary: { open: number };
  packageMembers: {
    documentType: DocumentTypeKey;
    role: "primary" | "supporting";
    position: number;
    availability: "available" | "unavailable";
  }[];
};

/** Pure baseline planning. It recommends catalogue members and makes no truth claims. */
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
