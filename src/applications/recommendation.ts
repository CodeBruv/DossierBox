import "server-only";

import { createHash } from "node:crypto";
import { isApplicationObjectiveKind, type ApplicationObjective } from "./index";
import { getApplicationOpportunityCapture, listApplicationRequirements } from "./opportunity-repository";
import { parseOpportunityInterpretation, type OpportunityInterpretation } from "./opportunity-interpretation-response";
import { resolveHybridApplicationPlan, type DeterministicPlanProposal } from "./planning";
import { getOwnedApplicationWithIntent } from "./repository";
import { documentTypeRegistry } from "@/documents/catalogue";
import type { PlanKey } from "@/entitlements/plan-keys";

export const recommendationContractVersion = "application-recommendation@1";

export type RecommendationIdentity = {
  contractVersion: typeof recommendationContractVersion;
  fingerprint: string;
  applicationId: string;
  opportunityId: string | null;
  opportunitySourceId: string | null;
  sourceFingerprint: string | null;
  interpretationVersion: string | null;
};

export type RecommendationContext = {
  application: NonNullable<Awaited<ReturnType<typeof getOwnedApplicationWithIntent>>>;
  objective: ApplicationObjective;
  interpretation: OpportunityInterpretation | null;
  proposal: DeterministicPlanProposal;
  identity: RecommendationIdentity;
  maxPackageSize: number;
  requirementCount: number;
};

const packageLimits: Readonly<Record<PlanKey, number>> = {
  basic: 1,
  plus: 3,
  // Professional's larger allowance is the complete current shipping/planned catalogue.
  professional: Object.keys(documentTypeRegistry).length,
};

export function packageLimitForPlan(plan: PlanKey): number {
  return packageLimits[plan];
}

export async function getOwnedRecommendationContext(
  userId: string,
  applicationId: string,
  plan: PlanKey,
): Promise<RecommendationContext | null> {
  const [application, capture, requirements] = await Promise.all([
    getOwnedApplicationWithIntent(userId, applicationId),
    getApplicationOpportunityCapture(userId, applicationId),
    listApplicationRequirements(userId, applicationId),
  ]);
  if (!application?.intent || !isApplicationObjectiveKind(application.intent.kind)) return null;

  const objective: ApplicationObjective = {
    kind: application.intent.kind,
    targetRole: application.intent.targetRole,
    organisation: application.intent.organisation,
    institution: application.intent.institution,
    programme: application.intent.programme,
    field: application.intent.field,
    country: application.intent.country,
    deadline: application.intent.deadline,
    requirements: application.intent.requirements,
    instructions: application.intent.instructions,
    wordLimit: application.intent.wordLimit,
    pageLimit: application.intent.pageLimit,
    requestedDocuments: application.intent.requestedDocuments,
  };

  let interpretation: OpportunityInterpretation | null = null;
  if (capture?.opportunity.interpretation && capture.opportunity.extractedText) {
    const parsed = parseOpportunityInterpretation(
      JSON.stringify(capture.opportunity.interpretation),
      capture.opportunity.extractedText,
    );
    if (parsed.ok) interpretation = parsed.interpretation;
  }

  const baselineSize = resolveHybridApplicationPlan(objective, {
    requirements: requirements.length,
    evidence: 0,
    openGaps: 0,
  }).recommendedDocuments.length;
  const maxPackageSize = Math.max(baselineSize, packageLimitForPlan(plan));
  const proposal = resolveHybridApplicationPlan(objective, {
    requirements: requirements.length,
    evidence: 0,
    openGaps: 0,
    interpretation,
    maxPackageSize,
  });

  const identityInput = {
    contractVersion: recommendationContractVersion,
    applicationId,
    intent: objective,
    opportunityId: capture?.opportunity.id ?? null,
    opportunityUpdatedAt: capture?.opportunity.updatedAt?.toISOString() ?? null,
    opportunitySourceId: capture?.source?.id ?? null,
    sourceFingerprint: capture?.source?.contentFingerprint ?? null,
    interpretationVersion: capture?.opportunity.interpretationVersion ?? null,
    interpretation,
    requirements: requirements.map((requirement) => ({
      id: requirement.id,
      updatedAt: requirement.updatedAt.toISOString(),
      text: requirement.text,
      status: requirement.interpretationStatus,
    })),
    plan,
    maxPackageSize,
  };
  const fingerprint = `sha256:${createHash("sha256").update(JSON.stringify(identityInput)).digest("hex")}`;

  return {
    application,
    objective,
    interpretation,
    proposal,
    maxPackageSize,
    requirementCount: requirements.length,
    identity: {
      contractVersion: recommendationContractVersion,
      fingerprint,
      applicationId,
      opportunityId: capture?.opportunity.id ?? null,
      opportunitySourceId: capture?.source?.id ?? null,
      sourceFingerprint: capture?.source?.contentFingerprint ?? null,
      interpretationVersion: capture?.opportunity.interpretationVersion ?? null,
    },
  };
}
