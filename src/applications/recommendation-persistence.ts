import "server-only";

import { and, eq, max } from "drizzle-orm";
import { db } from "@/auth/database";
import {
  documentTypeIsAvailable,
  isDocumentTypeKey,
  type DocumentTypeKey,
} from "@/documents/catalogue";
import { applications } from "./schema";
import {
  applicationPackageMembers,
  applicationPackages,
  applicationPlans,
} from "./planning-schema";
import { getOwnedApplicationPlan } from "./plans-repository";
import type { RecommendationContext, RecommendationIdentity } from "./recommendation";

export type RecommendationSelection = {
  documentTypes: readonly DocumentTypeKey[];
  resolutionSource: "deterministic" | "user_adjusted";
};

type StoredIdentity = {
  total: number;
  recommendationIdentity: RecommendationIdentity;
};

export function storedRecommendationIdentity(plan: { requirementCoverage: Record<string, unknown> }): RecommendationIdentity | null {
  const candidate = (plan.requirementCoverage as Partial<StoredIdentity>).recommendationIdentity;
  if (
    !candidate
    || typeof candidate !== "object"
    || candidate.contractVersion !== "application-recommendation@1"
    || typeof candidate.fingerprint !== "string"
    || typeof candidate.applicationId !== "string"
    || !(typeof candidate.opportunityId === "string" || candidate.opportunityId === null)
    || !(typeof candidate.opportunitySourceId === "string" || candidate.opportunitySourceId === null)
    || !(typeof candidate.sourceFingerprint === "string" || candidate.sourceFingerprint === null)
    || !(typeof candidate.interpretationVersion === "string" || candidate.interpretationVersion === null)
  ) return null;
  return candidate;
}

export function validateRecommendationSelection(
  values: readonly string[],
  context: RecommendationContext,
): DocumentTypeKey[] | null {
  const unique = [...new Set(values)];
  if (unique.length === 0 || unique.length > context.maxPackageSize) return null;
  if (!unique.every(isDocumentTypeKey)) return null;
  const baseline = context.proposal.packageMembers
    .filter((member) => member.reason === "application")
    .map((member) => member.documentType);
  if (!baseline.every((type) => unique.includes(type))) return null;
  return unique as DocumentTypeKey[];
}

/** Creates the versioned plan, package, and all members as one owner-scoped unit. */
export async function persistRecommendationPlan(
  userId: string,
  context: RecommendationContext,
  selection: RecommendationSelection,
  confirmed: boolean,
) {
  return db.transaction(async (transaction) => {
    const [owned] = await transaction
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.id, context.application.id), eq(applications.userId, userId)))
      .limit(1);
    if (!owned) return null;

    const [latest] = await transaction
      .select({ version: max(applicationPlans.version) })
      .from(applicationPlans)
      .where(eq(applicationPlans.applicationId, context.application.id));
    const [plan] = await transaction.insert(applicationPlans).values({
      applicationId: context.application.id,
      version: Number(latest?.version ?? 0) + 1,
      status: confirmed ? "confirmed" : "proposed",
      resolutionSource: selection.resolutionSource,
      confirmation: confirmed ? "confirmed" : "unconfirmed",
      recommendedDocuments: [...selection.documentTypes],
      requirementCoverage: {
        total: context.requirementCount,
        recommendationIdentity: context.identity,
      },
      evidenceCoverage: { total: 0 },
      gapsSummary: {
        open: 0,
        advisoryDocuments: context.proposal.advisoryDocuments ?? [],
        unsupportedDocuments: context.proposal.unsupportedDocuments ?? [],
        constrainedDocuments: context.proposal.constrainedDocuments ?? [],
        warnings: context.proposal.warnings ?? [],
      },
    }).returning();
    if (!plan) throw new Error("Recommendation plan could not be created.");

    const [applicationPackage] = await transaction.insert(applicationPackages).values({
      planId: plan.id,
      status: confirmed ? "confirmed" : "draft",
      confirmation: confirmed ? "confirmed" : "unconfirmed",
    }).returning();
    if (!applicationPackage) throw new Error("Recommendation package could not be created.");

    const memberValues = selection.documentTypes.map((documentType, position) => ({
      packageId: applicationPackage.id,
      documentType,
      role: position === 0 ? "primary" as const : "supporting" as const,
      position,
      availability: documentTypeIsAvailable(documentType) ? "available" as const : "unavailable" as const,
      specificationStatus: "not_started" as const,
      completion: "planned" as const,
      documentId: null,
    }));
    await transaction.insert(applicationPackageMembers).values(memberValues);

    return { plan, package: applicationPackage };
  });
}

export async function getOwnedAdjustedRecommendation(userId: string, planId: string) {
  const plan = await getOwnedApplicationPlan(userId, planId);
  if (!plan || plan.status !== "proposed" || plan.confirmation !== "unconfirmed" || plan.resolutionSource !== "user_adjusted") return null;
  const documentTypes = plan.recommendedDocuments.filter(isDocumentTypeKey);
  if (documentTypes.length !== plan.recommendedDocuments.length) return null;
  return { plan, documentTypes };
}
