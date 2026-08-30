import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/auth/database";
import { applications } from "@/applications/schema";
import { createApplicationPlan, listApplicationPlans } from "@/applications/plans-repository";
import {
  applicationPackageMembers,
  applicationPackages,
  applicationPlans,
} from "@/applications/planning-schema";
import {
  createApplicationPackage,
  createPackageMember,
  listApplicationPackages,
  listPackageMembers,
} from "@/applications/packages-repository";
import {
  getOwnedEvidence,
  listApplicationEvidence,
  listSelectableDossierEvidence,
  resolveOwnedDossierSource,
} from "@/applications/evidence-repository";
import { freeEntitlement } from "@/entitlements/entitlements";
import { getDossierSnapshot } from "@/profile/repository";
import { isDocumentTypeKey } from "./catalogue";
import { composeDocument } from "./composition";
import { createDurableGenerationPersistence } from "./generation-persistence";
import { getLatestOwnedGenerationForApplication } from "./generation-repository";
import { orchestrateGeneration } from "./generation-orchestrator";
import { getOwnedDocument } from "./repository";
import { documents } from "./schema";
import {
  getOwnedDocumentSpecification,
  listDocumentSpecifications,
} from "./specification-repository";

export async function getDocumentPreparation(userId: string, documentId: string) {
  const document = await getOwnedDocument(userId, documentId);
  if (!document?.applicationId) return null;
  const plans = await listApplicationPlans(userId, document.applicationId);
  const plan = plans[0] ?? null;
  const packages = plan ? await listApplicationPackages(userId, plan.id) : [];
  const applicationPackage = packages[0] ?? null;
  const members = applicationPackage ? await listPackageMembers(userId, applicationPackage.id) : [];
  const member = members.find((candidate) => candidate.documentId === document.id) ?? null;
  const [evidence, sources, specifications, generation] = await Promise.all([
    listApplicationEvidence(userId, document.applicationId),
    listSelectableDossierEvidence(userId),
    member ? listDocumentSpecifications(userId, member.id) : Promise.resolve([]),
    getLatestOwnedGenerationForApplication(userId, document.applicationId),
  ]);
  return { document, plan, applicationPackage, member, evidence, sources, specification: specifications[0] ?? null, generation };
}

export async function initializeDocumentPreparation(userId: string, documentId: string) {
  const current = await getDocumentPreparation(userId, documentId);
  if (!current) return null;
  const plan = current.plan ?? await createApplicationPlan(userId, current.document.applicationId!, {
    status: "confirmed",
    resolutionSource: "deterministic",
    confirmation: "confirmed",
    recommendedDocuments: [current.document.type],
    requirementCoverage: {},
    evidenceCoverage: {},
    gapsSummary: {},
  });
  if (!plan) return null;
  const applicationPackage = current.applicationPackage ?? await createApplicationPackage(userId, plan.id, {
    status: "confirmed",
    confirmation: "confirmed",
  });
  if (!applicationPackage) return null;
  const member = current.member ?? await createPackageMember(userId, applicationPackage.id, {
    documentType: current.document.type,
    role: "primary",
    position: 0,
    availability: "available",
    specificationStatus: "not_started",
    completion: "planned",
    documentId: current.document.id,
  });
  return member ? { plan, applicationPackage, member } : null;
}

export async function runApprovedDocumentGeneration(input: {
  userId: string;
  specificationId: string;
  revision: number;
  idempotencyKey: string;
}) {
  return orchestrateGeneration({
    userId: input.userId,
    specificationId: input.specificationId,
    specificationRevision: input.revision,
    idempotencyKey: input.idempotencyKey,
  }, {
    authenticate: async () => input.userId,
    getSpecification: async (userId, specificationId, revision) => {
      const specification = await getOwnedDocumentSpecification(userId, specificationId);
      if (!specification || specification.revision !== revision || !isDocumentTypeKey(specification.documentType)) return null;
      const context = await specificationContext(userId, specification.packageMemberId);
      if (!context) return null;
      return { ...specification, documentType: specification.documentType, applicationId: context.applicationId };
    },
    getEvidence: async (userId, evidenceId) => {
      const evidence = await getOwnedEvidence(userId, evidenceId);
      if (!evidence) return null;
      const source = await resolveOwnedDossierSource(userId, evidence.sourceType, evidence.sourceRecordId);
      if (!source) return null;
      return { evidenceId: evidence.id, applicationId: evidence.applicationId, sourceType: evidence.sourceType, sourceRecordId: evidence.sourceRecordId, excerpt: evidence.excerpt, lifecycle: evidence.lifecycle, source };
    },
    getHeader: async (userId, applicationId) => {
      const [document] = await db.select().from(documents).innerJoin(applications, eq(applications.id, documents.applicationId)).where(and(eq(documents.userId, userId), eq(documents.applicationId, applicationId), eq(applications.userId, userId))).limit(1);
      if (!document) throw new Error("Application document was not found.");
      const snapshot = await getDossierSnapshot(userId);
      if (!snapshot) throw new Error("Dossier was not found.");
      return composeDocument(document.documents.type, snapshot).header;
    },
    getEntitlement: async (_userId, now) => freeEntitlement(now),
    persistence: createDurableGenerationPersistence(),
  });
}

async function specificationContext(userId: string, memberId: string) {
  const [row] = await db.select({ applicationId: applicationPlans.applicationId }).from(applicationPackageMembers)
    .innerJoin(applicationPackages, eq(applicationPackages.id, applicationPackageMembers.packageId))
    .innerJoin(applicationPlans, eq(applicationPlans.id, applicationPackages.planId))
    .innerJoin(applications, eq(applications.id, applicationPlans.applicationId))
    .where(and(eq(applicationPackageMembers.id, memberId), eq(applications.userId, userId))).limit(1);
  return row ?? null;
}
