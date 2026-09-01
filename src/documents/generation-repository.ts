import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/auth/database";
import {
  opportunities,
  opportunitySources,
  requirements,
} from "@/applications/opportunity-schema";
import type { OpportunityInterpretation } from "@/applications/opportunity-interpretation-response";
import { applications } from "@/applications/schema";
import {
  applicationPackageMembers,
  applicationPackages,
  applicationPlans,
} from "@/applications/planning-schema";
import {
  generatedContentVersions,
  generationAttempts,
  generationEvidenceManifestItems,
  generationValidations,
  generationWorkItems,
  iuAccounts,
  iuLedgerEntries,
  providerExecutions,
} from "./generation-schema";
import { documentSpecifications } from "./specification-schema";
import { documents } from "./schema";
import { documentVersions } from "./version-schema";
import type {
  GenerationAttemptStatus,
  IuLedgerEntryKind,
  ValidationKind,
  ValidationStatus,
} from "./generation-domain";
import { assertAttemptTransition, fingerprintJson } from "./generation-domain";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type AttemptCreate = {
  readonly userId: string;
  readonly applicationId: string;
  readonly specificationId: string;
  readonly specificationRevision: number;
  readonly specificationFingerprint: string;
  readonly evidenceFingerprint: string;
  readonly requestFingerprint: string;
  readonly endpoint: string;
  readonly idempotencyKey: string;
  readonly entitlementPlan: string;
  readonly estimatedUnits: number;
};

type InterpretationAttemptCreate = {
  readonly userId: string;
  readonly applicationId: string;
  readonly opportunityId: string;
  readonly opportunitySourceId: string;
  readonly sourceFingerprint: string;
  readonly contractVersion: string;
  readonly requestFingerprint: string;
  readonly endpoint: string;
  readonly idempotencyKey: string;
  readonly entitlementPlan: string;
  readonly estimatedUnits: number;
};

async function ownedAttempt(userId: string, attemptId: string) {
  const [row] = await db
    .select({ attempt: generationAttempts })
    .from(generationAttempts)
    .innerJoin(applications, eq(applications.id, generationAttempts.applicationId))
    .where(and(
      eq(generationAttempts.id, attemptId),
      eq(generationAttempts.userId, userId),
      eq(applications.userId, userId),
    ))
    .limit(1);
  return row ?? null;
}

async function ownedAttemptIn(
  transaction: DatabaseTransaction,
  userId: string,
  attemptId: string,
  lock = false,
) {
  const query = transaction
    .select({ attempt: generationAttempts })
    .from(generationAttempts)
    .innerJoin(applications, eq(applications.id, generationAttempts.applicationId))
    .where(and(
      eq(generationAttempts.id, attemptId),
      eq(generationAttempts.userId, userId),
      eq(applications.userId, userId),
    ))
    .limit(1);
  const rows = lock ? await query.for("update", { of: generationAttempts }) : await query;
  return rows[0] ?? null;
}

export async function getOwnedIntelligenceAttempt(userId: string, attemptId: string) {
  return (await ownedAttempt(userId, attemptId))?.attempt ?? null;
}

export async function getOwnedGenerationContext(userId: string, attemptId: string) {
  const [owned] = await db
    .select({ attempt: generationAttempts, documentType: documentSpecifications.documentType })
    .from(generationAttempts)
    .innerJoin(applications, eq(applications.id, generationAttempts.applicationId))
    .innerJoin(applicationPlans, eq(applicationPlans.applicationId, applications.id))
    .innerJoin(applicationPackages, eq(applicationPackages.planId, applicationPlans.id))
    .innerJoin(applicationPackageMembers, eq(applicationPackageMembers.packageId, applicationPackages.id))
    .innerJoin(documentSpecifications, eq(documentSpecifications.packageMemberId, applicationPackageMembers.id))
    .where(and(
      eq(generationAttempts.id, attemptId),
      eq(generationAttempts.operationKind, "document_generation"),
      eq(generationAttempts.userId, userId),
      eq(applications.userId, userId),
      eq(documentSpecifications.id, generationAttempts.specificationId),
    ))
    .limit(1);
  return owned ?? null;
}

export async function getOwnedGenerationWorkItem(userId: string, attemptId: string, sectionKey: string) {
  const owned = await getOwnedGenerationContext(userId, attemptId);
  if (!owned) return null;
  const [workItem] = await db
    .select()
    .from(generationWorkItems)
    .where(and(eq(generationWorkItems.attemptId, attemptId), eq(generationWorkItems.sectionKey, sectionKey)))
    .limit(1);
  return workItem ?? null;
}

export async function findOwnedGenerationAttempt(userId: string, attemptId: string) {
  const owned = await getOwnedGenerationContext(userId, attemptId);
  if (!owned) return null;
  const attempt = owned.attempt;
  const [workItems, validations, executions, artifacts, evidence] = await Promise.all([
    db.select().from(generationWorkItems).where(eq(generationWorkItems.attemptId, attemptId)).orderBy(asc(generationWorkItems.workOrder)),
    db.select().from(generationValidations).where(eq(generationValidations.attemptId, attemptId)).orderBy(asc(generationValidations.createdAt)),
    db.select().from(providerExecutions).where(eq(providerExecutions.attemptId, attemptId)).orderBy(asc(providerExecutions.startedAt)),
    db.select().from(generatedContentVersions).where(eq(generatedContentVersions.attemptId, attemptId)).orderBy(asc(generatedContentVersions.version)),
    db.select().from(generationEvidenceManifestItems).where(eq(generationEvidenceManifestItems.attemptId, attemptId)).orderBy(asc(generationEvidenceManifestItems.evidenceId)),
  ]);
  return { attempt, workItems, validations, executions, artifacts, evidence };
}

export async function createGenerationAttempt(input: AttemptCreate) {
  const idempotencyIdentity = and(
    eq(generationAttempts.userId, input.userId),
    eq(generationAttempts.endpoint, input.endpoint),
    eq(generationAttempts.idempotencyKey, input.idempotencyKey),
  );
  const existing = await db
    .select()
    .from(generationAttempts)
    .where(idempotencyIdentity)
    .limit(1);
  if (existing[0]) {
    if (existing[0].requestFingerprint !== input.requestFingerprint) throw new Error("Idempotency key was reused for a different generation request.");
    return existing[0];
  }

  const [owned] = await db
    .select({ specification: documentSpecifications, applicationId: applicationPlans.applicationId })
    .from(documentSpecifications)
    .innerJoin(applicationPackageMembers, eq(applicationPackageMembers.id, documentSpecifications.packageMemberId))
    .innerJoin(applicationPackages, eq(applicationPackages.id, applicationPackageMembers.packageId))
    .innerJoin(applicationPlans, eq(applicationPlans.id, applicationPackages.planId))
    .innerJoin(applications, eq(applications.id, applicationPlans.applicationId))
    .where(and(eq(documentSpecifications.id, input.specificationId), eq(documentSpecifications.revision, input.specificationRevision), eq(applications.id, input.applicationId), eq(applications.userId, input.userId)))
    .limit(1);
  if (!owned || owned.specification.status !== "approved") return null;

  const [created] = await db.insert(generationAttempts).values({ ...input, operationKind: "document_generation" }).onConflictDoNothing({ target: [generationAttempts.userId, generationAttempts.endpoint, generationAttempts.idempotencyKey] }).returning();
  if (created) return created;
  const [raced] = await db.select().from(generationAttempts).where(idempotencyIdentity).limit(1);
  if (raced?.requestFingerprint !== input.requestFingerprint) throw new Error("Idempotency key was reused for a different generation request.");
  return raced ?? null;
}

export async function getOwnedOpportunityInterpretationContext(
  userId: string,
  applicationId: string,
  opportunityId: string,
  opportunitySourceId: string,
) {
  const [owned] = await db
    .select({
      application: applications,
      opportunity: opportunities,
      source: opportunitySources,
    })
    .from(applications)
    .innerJoin(opportunities, eq(opportunities.applicationId, applications.id))
    .innerJoin(opportunitySources, eq(opportunitySources.opportunityId, opportunities.id))
    .where(and(
      eq(applications.id, applicationId),
      eq(applications.userId, userId),
      eq(opportunities.id, opportunityId),
      eq(opportunitySources.id, opportunitySourceId),
    ))
    .limit(1);
  return owned ?? null;
}

export async function findOwnedOpportunityInterpretationAttempt(
  userId: string,
  opportunitySourceId: string,
  sourceFingerprint: string,
  contractVersion: string,
) {
  const [attempt] = await db
    .select()
    .from(generationAttempts)
    .innerJoin(applications, eq(applications.id, generationAttempts.applicationId))
    .where(and(
      eq(generationAttempts.userId, userId),
      eq(applications.userId, userId),
      eq(generationAttempts.operationKind, "opportunity_interpretation"),
      eq(generationAttempts.opportunitySourceId, opportunitySourceId),
      eq(generationAttempts.sourceFingerprint, sourceFingerprint),
      eq(generationAttempts.contractVersion, contractVersion),
    ))
    .orderBy(desc(generationAttempts.createdAt))
    .limit(1);
  return attempt?.generation_attempts ?? null;
}

export async function countOwnedSuccessfulOpportunityInterpretations(
  userId: string,
  since: Date,
): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(generationAttempts)
    .innerJoin(applications, eq(applications.id, generationAttempts.applicationId))
    .where(and(
      eq(generationAttempts.userId, userId),
      eq(applications.userId, userId),
      eq(generationAttempts.operationKind, "opportunity_interpretation"),
      eq(generationAttempts.status, "succeeded"),
      sql`${generationAttempts.completedAt} >= ${since}`,
    ));
  return result?.count ?? 0;
}

export async function createOpportunityInterpretationAttempt(
  input: InterpretationAttemptCreate,
) {
  const identity = and(
    eq(generationAttempts.userId, input.userId),
    eq(generationAttempts.endpoint, input.endpoint),
    eq(generationAttempts.idempotencyKey, input.idempotencyKey),
  );
  const existing = await db.select().from(generationAttempts).where(identity).limit(1);
  if (existing[0]) {
    if (existing[0].requestFingerprint !== input.requestFingerprint) {
      throw new Error("Idempotency key was reused for a different interpretation request.");
    }
    return existing[0];
  }

  const owned = await getOwnedOpportunityInterpretationContext(
    input.userId,
    input.applicationId,
    input.opportunityId,
    input.opportunitySourceId,
  );
  if (
    !owned
    || owned.source.extractedContentStatus !== "available"
    || owned.source.contentFingerprint !== input.sourceFingerprint
    || !owned.opportunity.extractedText?.trim()
  ) return null;

  const [created] = await db
    .insert(generationAttempts)
    .values({
      ...input,
      operationKind: "opportunity_interpretation",
    })
    .onConflictDoNothing({
      target: [
        generationAttempts.userId,
        generationAttempts.endpoint,
        generationAttempts.idempotencyKey,
      ],
    })
    .returning();
  if (created) return created;
  const [raced] = await db.select().from(generationAttempts).where(identity).limit(1);
  if (raced?.requestFingerprint !== input.requestFingerprint) {
    throw new Error("Idempotency key was reused for a different interpretation request.");
  }
  return raced ?? null;
}

export async function addGenerationWorkItems(userId: string, attemptId: string, items: readonly Omit<typeof generationWorkItems.$inferInsert, "attemptId">[]) {
  const owned = await ownedAttempt(userId, attemptId);
  if (items.length === 0 || owned?.attempt.operationKind !== "document_generation") return [];
  return db.insert(generationWorkItems).values(items.map((item) => ({ ...item, attemptId }))).onConflictDoNothing().returning();
}

export async function addEvidenceManifest(userId: string, attemptId: string, items: readonly Omit<typeof generationEvidenceManifestItems.$inferInsert, "attemptId">[]) {
  const owned = await ownedAttempt(userId, attemptId);
  if (items.length === 0 || owned?.attempt.operationKind !== "document_generation") return [];
  return db.insert(generationEvidenceManifestItems).values(items.map((item) => ({ ...item, attemptId }))).onConflictDoNothing().returning();
}

export async function transitionGenerationAttempt(userId: string, attemptId: string, status: GenerationAttemptStatus, failureKind?: string, failureDetail?: readonly string[]) {
  const current = await ownedAttempt(userId, attemptId);
  if (!current) return null;
  const attempt = current.attempt;
  assertAttemptTransition(attempt.status, status);
  const [updated] = await db.update(generationAttempts).set({ status, failureKind: failureKind ?? attempt.failureKind, failureDetail: failureDetail ?? attempt.failureDetail, completedAt: ["succeeded", "failed", "cancelled"].includes(status) ? new Date() : attempt.completedAt }).where(and(eq(generationAttempts.id, attemptId), eq(generationAttempts.status, attempt.status))).returning();
  return updated ?? null;
}

export async function reserveGenerationUnits(input: { userId: string; attemptId: string; units: number; entitlementPlan: string }) {
  if (!Number.isInteger(input.units) || input.units <= 0) throw new Error("Generation reservation must contain positive whole units.");
  return db.transaction(async (transaction) => {
    const attempt = await ownedAttemptIn(transaction, input.userId, input.attemptId, true);
    if (!attempt || attempt.attempt.status !== "created" || attempt.attempt.estimatedUnits !== input.units || attempt.attempt.entitlementPlan !== input.entitlementPlan) return null;
    await transaction.insert(iuAccounts).values({ userId: input.userId }).onConflictDoNothing();
    const [account] = await transaction.select().from(iuAccounts).where(eq(iuAccounts.userId, input.userId)).for("update");
    if (!account || account.availableUnits < input.units) return null;
    await transaction.update(iuAccounts).set({ availableUnits: sql`${iuAccounts.availableUnits} - ${input.units}`, reservedUnits: sql`${iuAccounts.reservedUnits} + ${input.units}`, updatedAt: new Date() }).where(eq(iuAccounts.userId, input.userId));
    const [entry] = await transaction.insert(iuLedgerEntries).values({ userId: input.userId, attemptId: input.attemptId, kind: "reservation", units: input.units, entitlementPlan: input.entitlementPlan, reason: `${attempt.attempt.operationKind}_reservation` }).returning();
    await transaction.update(generationAttempts).set({ status: "reserved" }).where(and(eq(generationAttempts.id, input.attemptId), eq(generationAttempts.status, "created")));
    return entry ?? null;
  });
}

export async function settleGenerationUnits(input: { userId: string; attemptId: string; succeeded: boolean; entitlementPlan: string }) {
  return db.transaction(async (transaction) => {
    const attempt = await ownedAttemptIn(transaction, input.userId, input.attemptId, true);
    if (!attempt || attempt.attempt.entitlementPlan !== input.entitlementPlan) return null;
    const [reservation] = await transaction.select().from(iuLedgerEntries).where(and(eq(iuLedgerEntries.attemptId, input.attemptId), eq(iuLedgerEntries.kind, "reservation"))).limit(1);
    if (!reservation) return null;
    const kind: IuLedgerEntryKind = input.succeeded ? "allocation" : "release";
    const opposite: IuLedgerEntryKind = input.succeeded ? "release" : "allocation";
    const [existing] = await transaction.select().from(iuLedgerEntries).where(and(eq(iuLedgerEntries.attemptId, input.attemptId), eq(iuLedgerEntries.kind, kind))).limit(1);
    if (existing) return existing;
    const [conflict] = await transaction.select().from(iuLedgerEntries).where(and(eq(iuLedgerEntries.attemptId, input.attemptId), eq(iuLedgerEntries.kind, opposite))).limit(1);
    if (conflict) return null;
    const [entry] = await transaction.insert(iuLedgerEntries).values({ userId: input.userId, attemptId: input.attemptId, kind, units: reservation.units, entitlementPlan: input.entitlementPlan, reason: input.succeeded ? `${attempt.attempt.operationKind}_consumption` : `${attempt.attempt.operationKind}_release` }).returning();
    const [account] = await transaction.update(iuAccounts).set({ reservedUnits: sql`${iuAccounts.reservedUnits} - ${reservation.units}`, ...(input.succeeded ? {} : { availableUnits: sql`${iuAccounts.availableUnits} + ${reservation.units}` }), updatedAt: new Date() }).where(and(eq(iuAccounts.userId, input.userId), sql`${iuAccounts.reservedUnits} >= ${reservation.units}`)).returning();
    if (!account) throw new Error("Reserved Generation units could not be settled.");
    return entry ?? null;
  });
}

export async function updateGenerationWorkItemStatus(input: {
  userId: string;
  attemptId: string;
  workItemId: string;
  status: "pending" | "running" | "succeeded" | "failed";
}) {
  const owned = await ownedAttempt(input.userId, input.attemptId);
  if (!owned) return null;
  const [updated] = await db
    .update(generationWorkItems)
    .set({
      status: input.status,
      completedAt: ["succeeded", "failed"].includes(input.status) ? new Date() : null,
    })
    .where(and(eq(generationWorkItems.id, input.workItemId), eq(generationWorkItems.attemptId, input.attemptId)))
    .returning();
  return updated ?? null;
}

export async function appendProviderExecution(userId: string, input: typeof providerExecutions.$inferInsert) {
  if (!(await ownedAttempt(userId, input.attemptId))) return null;
  if (input.workItemId) {
    const [workItem] = await db
      .select({ id: generationWorkItems.id })
      .from(generationWorkItems)
      .where(and(eq(generationWorkItems.id, input.workItemId), eq(generationWorkItems.attemptId, input.attemptId)))
      .limit(1);
    if (!workItem) return null;
  }
  const existing = await db
    .select()
    .from(providerExecutions)
    .where(and(
      eq(providerExecutions.attemptId, input.attemptId),
      input.workItemId
        ? eq(providerExecutions.workItemId, input.workItemId)
        : sql`${providerExecutions.workItemId} is null`,
      eq(providerExecutions.sequence, input.sequence),
    ))
    .limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db.insert(providerExecutions).values(input).returning();
  return row ?? null;
}

export async function failGenerationAttempt(input: {
  userId: string;
  attemptId: string;
  failureKind: string;
  failureDetail?: readonly string[];
  validation: Omit<typeof generationValidations.$inferInsert, "attemptId">;
}) {
  return db.transaction(async (transaction) => {
    const owned = await ownedAttemptIn(transaction, input.userId, input.attemptId, true);
    if (!owned) return null;
    if (owned.attempt.status === "failed" || owned.attempt.status === "cancelled") return owned.attempt;
    if (owned.attempt.status === "succeeded") return null;

    const [reservation] = await transaction
      .select()
      .from(iuLedgerEntries)
      .where(and(eq(iuLedgerEntries.attemptId, input.attemptId), eq(iuLedgerEntries.kind, "reservation")))
      .limit(1);
    if (reservation) {
      const [allocation] = await transaction
        .select({ id: iuLedgerEntries.id })
        .from(iuLedgerEntries)
        .where(and(eq(iuLedgerEntries.attemptId, input.attemptId), eq(iuLedgerEntries.kind, "allocation")))
        .limit(1);
      if (allocation) return null;
      const [release] = await transaction
        .select()
        .from(iuLedgerEntries)
        .where(and(eq(iuLedgerEntries.attemptId, input.attemptId), eq(iuLedgerEntries.kind, "release")))
        .limit(1);
      if (!release) {
        await transaction.insert(iuLedgerEntries).values({
          userId: input.userId,
          attemptId: input.attemptId,
          kind: "release",
          units: reservation.units,
          entitlementPlan: owned.attempt.entitlementPlan,
          reason: `${owned.attempt.operationKind}_release`,
        });
        const [account] = await transaction
          .update(iuAccounts)
          .set({
            reservedUnits: sql`${iuAccounts.reservedUnits} - ${reservation.units}`,
            availableUnits: sql`${iuAccounts.availableUnits} + ${reservation.units}`,
            updatedAt: new Date(),
          })
          .where(and(eq(iuAccounts.userId, input.userId), sql`${iuAccounts.reservedUnits} >= ${reservation.units}`))
          .returning();
        if (!account) throw new Error("Reserved Generation units could not be released.");
      }
    }

    await transaction.insert(generationValidations).values({ ...input.validation, attemptId: input.attemptId });
    const [failed] = await transaction
      .update(generationAttempts)
      .set({
        status: "failed",
        failureKind: input.failureKind,
        failureDetail: input.failureDetail ?? null,
        completedAt: new Date(),
      })
      .where(and(eq(generationAttempts.id, input.attemptId), eq(generationAttempts.status, owned.attempt.status)))
      .returning();
    if (!failed) throw new Error("Generation Attempt could not fail atomically.");
    return failed;
  });
}

export async function appendGenerationValidation(userId: string, input: typeof generationValidations.$inferInsert) {
  if (!(await ownedAttempt(userId, input.attemptId))) return null;
  if (input.workItemId) {
    const [workItem] = await db
      .select({ id: generationWorkItems.id })
      .from(generationWorkItems)
      .where(and(eq(generationWorkItems.id, input.workItemId), eq(generationWorkItems.attemptId, input.attemptId)))
      .limit(1);
    if (!workItem) return null;
  }
  const existing = await db
    .select()
    .from(generationValidations)
    .where(and(eq(generationValidations.attemptId, input.attemptId), eq(generationValidations.fingerprint, input.fingerprint), eq(generationValidations.kind, input.kind)))
    .limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db.insert(generationValidations).values(input).returning();
  return row ?? null;
}

export async function getOwnedGeneratedContentVersion(userId: string, generatedContentVersionId: string) {
  const [row] = await db
    .select({ artifact: generatedContentVersions, attempt: generationAttempts })
    .from(generatedContentVersions)
    .innerJoin(generationAttempts, eq(generationAttempts.id, generatedContentVersions.attemptId))
    .where(and(eq(generatedContentVersions.id, generatedContentVersionId), eq(generationAttempts.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function getLatestOwnedGenerationForApplication(userId: string, applicationId: string) {
  const [attempt] = await db
    .select()
    .from(generationAttempts)
    .innerJoin(applications, eq(applications.id, generationAttempts.applicationId))
    .where(and(eq(generationAttempts.userId, userId), eq(generationAttempts.applicationId, applicationId), eq(applications.userId, userId)))
    .orderBy(desc(generationAttempts.createdAt))
    .limit(1);
  if (!attempt) return null;
  const [artifact] = await db.select().from(generatedContentVersions).where(eq(generatedContentVersions.attemptId, attempt.generation_attempts.id)).orderBy(desc(generatedContentVersions.version)).limit(1);
  return { attempt: attempt.generation_attempts, artifact: artifact ?? null };
}

export async function completeGenerationAttempt(input: {
  userId: string;
  attemptId: string;
  entitlementPlan: string;
  artifact: Omit<typeof generatedContentVersions.$inferInsert, "attemptId">;
  compilerValidation: Omit<typeof generationValidations.$inferInsert, "attemptId">;
}) {
  return db.transaction(async (transaction) => {
    const attempt = await ownedAttemptIn(transaction, input.userId, input.attemptId, true);
    if (
      !attempt
      || attempt.attempt.operationKind !== "document_generation"
      || attempt.attempt.entitlementPlan !== input.entitlementPlan
    ) return null;
    if (attempt.attempt.status === "succeeded") {
      const [existingArtifact] = await transaction
        .select()
        .from(generatedContentVersions)
        .where(and(eq(generatedContentVersions.attemptId, input.attemptId), eq(generatedContentVersions.version, input.artifact.version)))
        .limit(1);
      return existingArtifact ? { attempt: attempt.attempt, artifact: existingArtifact } : null;
    }
    if (attempt.attempt.status !== "running") return null;
    const [reservation] = await transaction.select().from(iuLedgerEntries).where(and(eq(iuLedgerEntries.attemptId, input.attemptId), eq(iuLedgerEntries.kind, "reservation"))).limit(1);
    if (!reservation || reservation.userId !== input.userId || reservation.units !== attempt.attempt.estimatedUnits) return null;
    const [release] = await transaction.select().from(iuLedgerEntries).where(and(eq(iuLedgerEntries.attemptId, input.attemptId), eq(iuLedgerEntries.kind, "release"))).limit(1);
    if (release) return null;
    const [artifact] = await transaction.insert(generatedContentVersions).values({ ...input.artifact, attemptId: input.attemptId }).returning();
    await transaction.insert(generationValidations).values({ ...input.compilerValidation, attemptId: input.attemptId });
    const [allocation] = await transaction.select().from(iuLedgerEntries).where(and(eq(iuLedgerEntries.attemptId, input.attemptId), eq(iuLedgerEntries.kind, "allocation"))).limit(1);
    if (!allocation) {
      await transaction.insert(iuLedgerEntries).values({ userId: input.userId, attemptId: input.attemptId, kind: "allocation", units: reservation.units, entitlementPlan: input.entitlementPlan, reason: "document_generation_consumption" });
    }
    const [account] = await transaction.update(iuAccounts).set({ reservedUnits: sql`${iuAccounts.reservedUnits} - ${reservation.units}`, updatedAt: new Date() }).where(and(eq(iuAccounts.userId, input.userId), sql`${iuAccounts.reservedUnits} >= ${reservation.units}`)).returning();
    if (!account) throw new Error("Reserved Generation units could not be allocated.");
    const [completed] = await transaction.update(generationAttempts).set({ status: "succeeded", completedAt: new Date() }).where(and(eq(generationAttempts.id, input.attemptId), eq(generationAttempts.status, "running"))).returning();
    if (!artifact || !completed) throw new Error("Generation Attempt could not be completed atomically.");
    return { attempt: completed, artifact };
  });
}

export async function completeOpportunityInterpretationAttempt(input: {
  userId: string;
  attemptId: string;
  entitlementPlan: string;
  interpretation: OpportunityInterpretation;
  schemaVersion: string;
  validationFingerprint: string;
}) {
  return db.transaction(async (transaction) => {
    const owned = await ownedAttemptIn(
      transaction,
      input.userId,
      input.attemptId,
      true,
    );
    const attempt = owned?.attempt;
    if (
      !attempt
      || attempt.operationKind !== "opportunity_interpretation"
      || attempt.entitlementPlan !== input.entitlementPlan
      || !attempt.opportunityId
      || !attempt.opportunitySourceId
      || !attempt.sourceFingerprint
      || !attempt.contractVersion
    ) return null;

    const [target] = await transaction
      .select({
        opportunity: opportunities,
        source: opportunitySources,
      })
      .from(opportunities)
      .innerJoin(
        opportunitySources,
        eq(opportunitySources.opportunityId, opportunities.id),
      )
      .innerJoin(
        applications,
        eq(applications.id, opportunities.applicationId),
      )
      .where(and(
        eq(opportunities.id, attempt.opportunityId),
        eq(opportunities.applicationId, attempt.applicationId),
        eq(opportunitySources.id, attempt.opportunitySourceId),
        eq(applications.userId, input.userId),
      ))
      .for("update");

    if (
      !target
      || target.source.extractedContentStatus !== "available"
      || target.source.contentFingerprint !== attempt.sourceFingerprint
      || !target.opportunity.extractedText?.trim()
    ) return null;

    const persisted = target.opportunity.interpretation;
    if (attempt.status === "succeeded") {
      return target.opportunity.interpretationVersion === attempt.contractVersion
        && persisted?.sourceId === attempt.opportunitySourceId
        && persisted?.sourceFingerprint === attempt.sourceFingerprint
        ? { attempt, opportunity: target.opportunity }
        : null;
    }
    if (attempt.status !== "running") return null;

    const [reservation] = await transaction
      .select()
      .from(iuLedgerEntries)
      .where(and(
        eq(iuLedgerEntries.attemptId, input.attemptId),
        eq(iuLedgerEntries.kind, "reservation"),
      ))
      .limit(1);
    if (
      !reservation
      || reservation.userId !== input.userId
      || reservation.units !== attempt.estimatedUnits
      || reservation.entitlementPlan !== input.entitlementPlan
    ) return null;

    const [settlement] = await transaction
      .select({ kind: iuLedgerEntries.kind })
      .from(iuLedgerEntries)
      .where(and(
        eq(iuLedgerEntries.attemptId, input.attemptId),
        sql`${iuLedgerEntries.kind} in ('allocation', 'release')`,
      ))
      .limit(1);
    if (settlement) return null;

    await transaction
      .delete(requirements)
      .where(and(
        eq(requirements.applicationId, attempt.applicationId),
        eq(requirements.opportunityId, attempt.opportunityId),
        eq(requirements.interpretationStatus, "extracted"),
      ));

    const extractedRequirements = [
      ...input.interpretation.requirements.map((requirement) => ({
        applicationId: attempt.applicationId,
        opportunityId: attempt.opportunityId,
        text: requirement.text,
        category: requirement.category,
        priority: requirement.priority,
        sourceId: attempt.opportunitySourceId,
        sourceReference: requirement.sourceReference,
        confidence: requirement.confidence,
        interpretationStatus: "extracted" as const,
        normalizedInterpretation: requirement.normalized,
        constraints: {
          items: requirement.constraints,
          support: requirement.support,
        },
      })),
      ...input.interpretation.requestedDocuments.map((document) => ({
        applicationId: attempt.applicationId,
        opportunityId: attempt.opportunityId,
        text: document.name,
        category: "document" as const,
        priority: document.priority,
        sourceId: attempt.opportunitySourceId,
        sourceReference: document.sourceReference,
        confidence: document.confidence,
        interpretationStatus: "extracted" as const,
        normalizedInterpretation: document.details ?? document.name,
        constraints: {
          items: document.constraints,
          support: document.support,
        },
      })),
    ];
    if (extractedRequirements.length > 0) {
      await transaction.insert(requirements).values(extractedRequirements);
    }

    const interpretation = {
      schemaVersion: input.schemaVersion,
      contractVersion: attempt.contractVersion,
      sourceId: attempt.opportunitySourceId,
      sourceFingerprint: attempt.sourceFingerprint,
      context: input.interpretation.context,
      requirements: input.interpretation.requirements,
      requestedDocuments: input.interpretation.requestedDocuments,
      constraints: input.interpretation.constraints,
    } satisfies Record<string, unknown>;
    const [opportunity] = await transaction
      .update(opportunities)
      .set({
        interpretationStatus: "extracted",
        interpretation,
        interpretationVersion: attempt.contractVersion,
        updatedAt: new Date(),
      })
      .where(and(
        eq(opportunities.id, attempt.opportunityId),
        eq(opportunities.applicationId, attempt.applicationId),
      ))
      .returning();

    await transaction.insert(generationValidations).values({
      attemptId: input.attemptId,
      kind: "provenance",
      status: "passed",
      fingerprint: input.validationFingerprint,
      issues: [],
    });
    await transaction.insert(iuLedgerEntries).values({
      userId: input.userId,
      attemptId: input.attemptId,
      kind: "allocation",
      units: reservation.units,
      entitlementPlan: input.entitlementPlan,
      reason: "opportunity_interpretation_consumption",
    });
    const [account] = await transaction
      .update(iuAccounts)
      .set({
        reservedUnits: sql`${iuAccounts.reservedUnits} - ${reservation.units}`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(iuAccounts.userId, input.userId),
        sql`${iuAccounts.reservedUnits} >= ${reservation.units}`,
      ))
      .returning();
    if (!account) {
      throw new Error("Reserved Opportunity Interpretation units could not be allocated.");
    }

    const [completed] = await transaction
      .update(generationAttempts)
      .set({ status: "succeeded", completedAt: new Date() })
      .where(and(
        eq(generationAttempts.id, input.attemptId),
        eq(generationAttempts.status, "running"),
      ))
      .returning();
    if (!opportunity || !completed) {
      throw new Error("Opportunity Interpretation could not be completed atomically.");
    }
    return { attempt: completed, opportunity };
  });
}

export async function acceptGeneratedContentVersion(input: {
  userId: string;
  generatedContentVersionId: string;
  title?: string;
  configuration?: Record<string, unknown>;
}) {
  return db.transaction(async (transaction) => {
    const [source] = await transaction
      .select({
        artifact: generatedContentVersions,
        attempt: generationAttempts,
        specification: documentSpecifications,
        member: applicationPackageMembers,
        package: applicationPackages,
        plan: applicationPlans,
        application: applications,
      })
      .from(generatedContentVersions)
      .innerJoin(generationAttempts, eq(generationAttempts.id, generatedContentVersions.attemptId))
      .innerJoin(documentSpecifications, eq(documentSpecifications.id, generationAttempts.specificationId))
      .innerJoin(applicationPackageMembers, eq(applicationPackageMembers.id, documentSpecifications.packageMemberId))
      .innerJoin(applicationPackages, eq(applicationPackages.id, applicationPackageMembers.packageId))
      .innerJoin(applicationPlans, eq(applicationPlans.id, applicationPackages.planId))
      .innerJoin(applications, eq(applications.id, applicationPlans.applicationId))
      .where(and(
        eq(generatedContentVersions.id, input.generatedContentVersionId),
        eq(generationAttempts.userId, input.userId),
        eq(applications.userId, input.userId),
      ))
      .for("update", { of: applicationPackageMembers });

    if (
      !source
      || source.attempt.operationKind !== "document_generation"
      || source.attempt.status !== "succeeded"
      || source.attempt.applicationId !== source.application.id
      || !source.attempt.specificationFingerprint
      || !source.attempt.evidenceFingerprint
      || source.artifact.documentType !== source.specification.documentType
      || source.member.documentType !== source.artifact.documentType
    ) return null;

    let document = source.member.documentId
      ? (await transaction.select().from(documents).where(and(eq(documents.id, source.member.documentId), eq(documents.userId, input.userId))).for("update"))[0]
      : undefined;

    if (source.member.documentId && (!document || document.applicationId !== source.application.id || document.type !== source.artifact.documentType)) return null;

    if (!document) {
      const [created] = await transaction.insert(documents).values({
        userId: input.userId,
        applicationId: source.application.id,
        type: source.artifact.documentType as "professional_cv" | "professional_resume" | "academic_cv",
        title: input.title?.trim() || `${source.artifact.documentType} draft`,
        status: "draft",
      }).returning();
      if (!created) throw new Error("Document could not be created.");
      document = created;
      const [attached] = await transaction.update(applicationPackageMembers).set({ documentId: document.id, updatedAt: new Date() }).where(and(eq(applicationPackageMembers.id, source.member.id), sql`${applicationPackageMembers.documentId} is null`)).returning({ id: applicationPackageMembers.id });
      if (!attached) throw new Error("Package Member could not be attached to the Document.");
    }

    const [existing] = await transaction.select().from(documentVersions).where(eq(documentVersions.sourceGeneratedContentVersionId, source.artifact.id)).limit(1);
    if (existing) return { document, version: existing };

    // Every accepted version receives a complete immutable presentation/composition snapshot.
    // Caller values may override the mutable Document defaults, but omitted values never become
    // historical reads of the Document row later. The contract is data in the immutable JSONB
    // snapshot, not a schema column, so future renderers can interpret the historical choice.
    const configuration = {
      ...input.configuration,
      presentationContractVersion: "presentation-v1" as const,
      presentationStyle: input.configuration?.presentationStyle ?? document.template,
      hiddenSections: input.configuration?.hiddenSections ?? document.hiddenSections,
      sectionOrder: input.configuration?.sectionOrder ?? document.sectionOrder,
    };
    const [latest] = await transaction.select({ version: documentVersions.version }).from(documentVersions).where(eq(documentVersions.documentId, document.id)).orderBy(desc(documentVersions.version)).limit(1);
    const [version] = await transaction.insert(documentVersions).values({
      documentId: document.id,
      userId: input.userId,
      applicationId: source.application.id,
      version: (latest?.version ?? 0) + 1,
      sourceGeneratedContentVersionId: source.artifact.id,
      sourceSpecificationId: source.specification.id,
      sourceSpecificationRevision: source.specification.revision,
      sourceSpecificationFingerprint: source.attempt.specificationFingerprint,
      sourceEvidenceFingerprint: source.attempt.evidenceFingerprint,
      specification: source.specification as unknown as Record<string, unknown>,
      selectedEvidence: await transaction
        .select({
          evidenceId: generationEvidenceManifestItems.evidenceId,
          sourceType: generationEvidenceManifestItems.sourceType,
          sourceRecordId: generationEvidenceManifestItems.sourceRecordId,
        })
        .from(generationEvidenceManifestItems)
        .where(eq(generationEvidenceManifestItems.attemptId, source.attempt.id))
        .orderBy(asc(generationEvidenceManifestItems.evidenceId)),
      content: source.artifact.content,
      provenance: source.artifact.provenance,
      configuration,
      contentFingerprint: source.artifact.contentFingerprint,
      compilerFingerprint: source.artifact.compilerFingerprint,
      configurationFingerprint: fingerprintJson(configuration),
    }).returning();
    if (!version) throw new Error("Document Version could not be created.");
    return { document, version };
  });
}

export type { AttemptCreate };
export type { ValidationKind, ValidationStatus };
