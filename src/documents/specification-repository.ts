import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/auth/database";
import { isDocumentTypeKey, type DocumentTypeKey } from "@/documents/catalogue";
import { documents } from "@/documents/schema";
import {
  applicationPackageMembers,
  applicationPackages,
  applicationPlans,
  evidence,
} from "@/applications/planning-schema";
import { applications } from "@/applications/schema";
import { opportunities, requirements } from "@/applications/opportunity-schema";
import {
  documentSpecificationEvidence,
  documentSpecificationRequirements,
  documentSpecifications,
  type DocumentSpecificationConstraints,
  type DocumentSpecificationOutputCharacteristics,
  type DocumentSpecificationSectionExpectations,
  type DocumentSpecificationStatus,
} from "./specification-schema";

export type DocumentSpecificationInput = {
  documentType: DocumentTypeKey;
  purpose: string;
  opportunityId?: string | null;
  requirementIds?: readonly string[];
  evidenceIds?: readonly string[];
  constraints?: DocumentSpecificationConstraints;
  instructions?: string | null;
  context?: string | null;
  sectionExpectations?: DocumentSpecificationSectionExpectations;
  outputCharacteristics?: DocumentSpecificationOutputCharacteristics;
};

export type DocumentSpecificationUpdate = Partial<
  Pick<
    DocumentSpecificationInput,
    | "purpose"
    | "opportunityId"
    | "requirementIds"
    | "evidenceIds"
    | "constraints"
    | "instructions"
    | "context"
    | "sectionExpectations"
    | "outputCharacteristics"
  >
>;

const statuses = new Set<string>([
  "draft",
  "ready_for_review",
  "approved",
  "superseded",
  "archived",
]);

const transitions: Record<DocumentSpecificationStatus, readonly DocumentSpecificationStatus[]> = {
  draft: ["ready_for_review", "archived"],
  ready_for_review: ["draft", "approved", "archived"],
  approved: ["superseded", "archived"],
  superseded: ["archived"],
  archived: [],
};

async function ownedMember(userId: string, memberId: string) {
  const [row] = await db
    .select({
      member: applicationPackageMembers,
      applicationId: applicationPlans.applicationId,
      documentApplicationId: documents.applicationId,
      documentOwnerId: documents.userId,
      documentType: documents.type,
    })
    .from(applicationPackageMembers)
    .innerJoin(
      applicationPackages,
      eq(applicationPackages.id, applicationPackageMembers.packageId),
    )
    .innerJoin(applicationPlans, eq(applicationPlans.id, applicationPackages.planId))
    .innerJoin(applications, eq(applications.id, applicationPlans.applicationId))
    .leftJoin(documents, eq(documents.id, applicationPackageMembers.documentId))
    .where(
      and(
        eq(applicationPackageMembers.id, memberId),
        eq(applications.userId, userId),
      ),
    )
    .limit(1);

  if (!row) return null;
  if (
    row.member.documentId &&
    (row.documentOwnerId !== userId ||
      row.documentApplicationId !== row.applicationId ||
      row.documentType !== row.member.documentType)
  ) {
    return null;
  }
  return row;
}

async function ownedSpecification(userId: string, specificationId: string) {
  const [row] = await db
    .select({ specification: documentSpecifications, applicationId: applicationPlans.applicationId })
    .from(documentSpecifications)
    .innerJoin(
      applicationPackageMembers,
      eq(applicationPackageMembers.id, documentSpecifications.packageMemberId),
    )
    .innerJoin(
      applicationPackages,
      eq(applicationPackages.id, applicationPackageMembers.packageId),
    )
    .innerJoin(applicationPlans, eq(applicationPlans.id, applicationPackages.planId))
    .innerJoin(applications, eq(applications.id, applicationPlans.applicationId))
    .where(and(eq(documentSpecifications.id, specificationId), eq(applications.userId, userId)))
    .limit(1);
  return row ?? null;
}

async function validateReferences(
  applicationId: string,
  input: Pick<DocumentSpecificationInput, "opportunityId" | "requirementIds" | "evidenceIds">,
) {
  const requirementIds = [...new Set(input.requirementIds ?? [])];
  const evidenceIds = [...new Set(input.evidenceIds ?? [])];

  if (input.opportunityId) {
    const [opportunity] = await db
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(and(eq(opportunities.id, input.opportunityId), eq(opportunities.applicationId, applicationId)))
      .limit(1);
    if (!opportunity) return null;
  }

  if (requirementIds.length > 0) {
    const rows = await db
      .select({ id: requirements.id })
      .from(requirements)
      .where(and(eq(requirements.applicationId, applicationId), inArray(requirements.id, requirementIds)));
    if (rows.length !== requirementIds.length) return null;
  }

  if (evidenceIds.length > 0) {
    const rows = await db
      .select({ id: evidence.id })
      .from(evidence)
      .where(and(eq(evidence.applicationId, applicationId), inArray(evidence.id, evidenceIds)));
    if (rows.length !== evidenceIds.length) return null;
  }

  return { requirementIds, evidenceIds };
}

function validPurpose(purpose: string | undefined): purpose is string {
  return typeof purpose === "string" && purpose.trim().length > 0;
}

function validStatus(status: string): status is DocumentSpecificationStatus {
  return statuses.has(status);
}

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function replaceReferences(
  transaction: DatabaseTransaction,
  specificationId: string,
  requirementIds: readonly string[],
  evidenceIds: readonly string[],
) {
  await transaction
    .delete(documentSpecificationRequirements)
    .where(eq(documentSpecificationRequirements.specificationId, specificationId));
  await transaction
    .delete(documentSpecificationEvidence)
    .where(eq(documentSpecificationEvidence.specificationId, specificationId));

  if (requirementIds.length > 0) {
    await transaction.insert(documentSpecificationRequirements).values(
      requirementIds.map((requirementId) => ({ specificationId, requirementId })),
    );
  }
  if (evidenceIds.length > 0) {
    await transaction.insert(documentSpecificationEvidence).values(
      evidenceIds.map((evidenceId) => ({ specificationId, evidenceId })),
    );
  }
}

async function hydrate(specification: typeof documentSpecifications.$inferSelect) {
  const [requirementsRows, evidenceRows] = await Promise.all([
    db
      .select({ requirementId: documentSpecificationRequirements.requirementId })
      .from(documentSpecificationRequirements)
      .where(eq(documentSpecificationRequirements.specificationId, specification.id))
      .orderBy(asc(documentSpecificationRequirements.requirementId)),
    db
      .select({ evidenceId: documentSpecificationEvidence.evidenceId })
      .from(documentSpecificationEvidence)
      .where(eq(documentSpecificationEvidence.specificationId, specification.id))
      .orderBy(asc(documentSpecificationEvidence.evidenceId)),
  ]);

  return {
    ...specification,
    requirementIds: requirementsRows.map((row) => row.requirementId),
    evidenceIds: evidenceRows.map((row) => row.evidenceId),
  };
}

export async function createDocumentSpecification(
  userId: string,
  packageMemberId: string,
  input: DocumentSpecificationInput,
) {
  const member = await ownedMember(userId, packageMemberId);
  if (!member || !isDocumentTypeKey(input.documentType) || input.documentType !== member.member.documentType) return null;
  if (!validPurpose(input.purpose)) return null;
  const references = await validateReferences(member.applicationId, input);
  if (!references) return null;

  const created = await db.transaction(async (transaction) => {
    await transaction
      .select({ id: applicationPackageMembers.id })
      .from(applicationPackageMembers)
      .where(eq(applicationPackageMembers.id, packageMemberId))
      .for("update");
    const [latest] = await transaction
      .select({ revision: documentSpecifications.revision })
      .from(documentSpecifications)
      .where(eq(documentSpecifications.packageMemberId, packageMemberId))
      .orderBy(desc(documentSpecifications.revision))
      .limit(1);
    const revision = (latest?.revision ?? 0) + 1;

    const [row] = await transaction
      .insert(documentSpecifications)
      .values({
        packageMemberId,
        documentType: input.documentType,
        revision,
        purpose: input.purpose.trim(),
        opportunityId: input.opportunityId ?? null,
        constraints: input.constraints ?? {},
        instructions: input.instructions ?? null,
        context: input.context ?? null,
        sectionExpectations: input.sectionExpectations ?? {},
        outputCharacteristics: input.outputCharacteristics ?? {},
      })
      .returning();
    if (!row) throw new Error("Document Specification could not be created.");
    await replaceReferences(transaction, row.id, references.requirementIds, references.evidenceIds);
    await transaction
      .update(applicationPackageMembers)
      .set({ specificationStatus: "placeholder", updatedAt: new Date() })
      .where(eq(applicationPackageMembers.id, packageMemberId));
    return row;
  });

  return hydrate(created);
}

export async function getOwnedDocumentSpecification(userId: string, specificationId: string) {
  const owned = await ownedSpecification(userId, specificationId);
  return owned ? hydrate(owned.specification) : null;
}

export async function listDocumentSpecifications(userId: string, packageMemberId: string) {
  if (!(await ownedMember(userId, packageMemberId))) return [];
  const rows = await db
    .select()
    .from(documentSpecifications)
    .where(eq(documentSpecifications.packageMemberId, packageMemberId))
    .orderBy(desc(documentSpecifications.revision));
  return Promise.all(rows.map(hydrate));
}

export async function listApplicationDocumentSpecifications(
  userId: string,
  applicationId: string,
) {
  const rows = await db
    .select({ specification: documentSpecifications })
    .from(documentSpecifications)
    .innerJoin(
      applicationPackageMembers,
      eq(applicationPackageMembers.id, documentSpecifications.packageMemberId),
    )
    .innerJoin(
      applicationPackages,
      eq(applicationPackages.id, applicationPackageMembers.packageId),
    )
    .innerJoin(applicationPlans, eq(applicationPlans.id, applicationPackages.planId))
    .innerJoin(applications, eq(applications.id, applicationPlans.applicationId))
    .where(
      and(
        eq(applicationPlans.applicationId, applicationId),
        eq(applications.userId, userId),
      ),
    )
    .orderBy(asc(applicationPackageMembers.position), desc(documentSpecifications.revision));
  return Promise.all(rows.map((row) => hydrate(row.specification)));
}

export async function updateDocumentSpecification(
  userId: string,
  specificationId: string,
  input: DocumentSpecificationUpdate,
) {
  const owned = await ownedSpecification(userId, specificationId);
  if (!owned) return null;
  const current = await hydrate(owned.specification);
  const next = { ...current, ...input };
  if (!validPurpose(next.purpose)) return null;
  const references = await validateReferences(owned.applicationId, next);
  if (!references) return null;

  return createDocumentSpecification(userId, current.packageMemberId, {
    documentType: current.documentType as DocumentTypeKey,
    purpose: next.purpose,
    opportunityId: next.opportunityId,
    requirementIds: references.requirementIds,
    evidenceIds: references.evidenceIds,
    constraints: next.constraints,
    instructions: next.instructions,
    context: next.context,
    sectionExpectations: next.sectionExpectations,
    outputCharacteristics: next.outputCharacteristics,
  });
}

export async function transitionDocumentSpecification(
  userId: string,
  specificationId: string,
  status: DocumentSpecificationStatus,
) {
  if (!validStatus(status)) return null;
  const owned = await ownedSpecification(userId, specificationId);
  if (!owned || !transitions[owned.specification.status].includes(status)) return null;

  const [updated] = await db
    .update(documentSpecifications)
    .set({ status, updatedAt: new Date() })
    .where(eq(documentSpecifications.id, specificationId))
    .returning();
  if (!updated) return null;
  await db
    .update(applicationPackageMembers)
    .set({ specificationStatus: "placeholder", updatedAt: new Date() })
    .where(eq(applicationPackageMembers.id, updated.packageMemberId));
  return hydrate(updated);
}
