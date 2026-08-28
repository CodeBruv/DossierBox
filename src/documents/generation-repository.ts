import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/auth/database";
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
import type {
  GenerationAttemptStatus,
  IuLedgerEntryKind,
  ValidationKind,
  ValidationStatus,
} from "./generation-domain";
import { assertAttemptTransition } from "./generation-domain";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type AttemptCreate = {
  readonly userId: string;
  readonly applicationId: string;
  readonly specificationId: string;
  readonly specificationRevision: number;
  readonly specificationFingerprint: string;
  readonly evidenceFingerprint: string;
  readonly requestFingerprint: string;
  readonly idempotencyKey: string;
  readonly entitlementPlan: string;
  readonly estimatedUnits: number;
};

async function ownedAttempt(userId: string, attemptId: string) {
  const [row] = await db
    .select({ attempt: generationAttempts, documentType: documentSpecifications.documentType })
    .from(generationAttempts)
    .innerJoin(applications, eq(applications.id, generationAttempts.applicationId))
    .innerJoin(applicationPlans, eq(applicationPlans.applicationId, applications.id))
    .innerJoin(applicationPackages, eq(applicationPackages.planId, applicationPlans.id))
    .innerJoin(applicationPackageMembers, eq(applicationPackageMembers.packageId, applicationPackages.id))
    .innerJoin(documentSpecifications, eq(documentSpecifications.packageMemberId, applicationPackageMembers.id))
    .where(and(eq(generationAttempts.id, attemptId), eq(generationAttempts.userId, userId), eq(applications.userId, userId), eq(documentSpecifications.id, generationAttempts.specificationId)))
    .limit(1);
  return row ?? null;
}

async function ownedAttemptIn(
  transaction: DatabaseTransaction,
  userId: string,
  attemptId: string,
) {
  const [row] = await transaction
    .select({ attempt: generationAttempts, documentType: documentSpecifications.documentType })
    .from(generationAttempts)
    .innerJoin(applications, eq(applications.id, generationAttempts.applicationId))
    .innerJoin(applicationPlans, eq(applicationPlans.applicationId, applications.id))
    .innerJoin(applicationPackages, eq(applicationPackages.planId, applicationPlans.id))
    .innerJoin(applicationPackageMembers, eq(applicationPackageMembers.packageId, applicationPackages.id))
    .innerJoin(documentSpecifications, eq(documentSpecifications.packageMemberId, applicationPackageMembers.id))
    .where(and(eq(generationAttempts.id, attemptId), eq(generationAttempts.userId, userId), eq(applications.userId, userId), eq(documentSpecifications.id, generationAttempts.specificationId)))
    .limit(1);
  return row ?? null;
}

export async function getOwnedGenerationContext(userId: string, attemptId: string) {
  const owned = await ownedAttempt(userId, attemptId);
  if (!owned) return null;
  return {
    attempt: owned.attempt,
    documentType: owned.documentType,
  };
}

export async function getOwnedGenerationWorkItem(userId: string, attemptId: string, sectionKey: string) {
  const owned = await ownedAttempt(userId, attemptId);
  if (!owned) return null;
  const [workItem] = await db
    .select()
    .from(generationWorkItems)
    .where(and(eq(generationWorkItems.attemptId, attemptId), eq(generationWorkItems.sectionKey, sectionKey)))
    .limit(1);
  return workItem ?? null;
}

export async function findOwnedGenerationAttempt(userId: string, attemptId: string) {
  const owned = await ownedAttempt(userId, attemptId);
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
  const existing = await db
    .select()
    .from(generationAttempts)
    .where(and(eq(generationAttempts.userId, input.userId), eq(generationAttempts.idempotencyKey, input.idempotencyKey)))
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

  const [created] = await db.insert(generationAttempts).values(input).onConflictDoNothing({ target: [generationAttempts.userId, generationAttempts.idempotencyKey] }).returning();
  if (created) return created;
  const [raced] = await db.select().from(generationAttempts).where(and(eq(generationAttempts.userId, input.userId), eq(generationAttempts.idempotencyKey, input.idempotencyKey))).limit(1);
  if (raced?.requestFingerprint !== input.requestFingerprint) throw new Error("Idempotency key was reused for a different generation request.");
  return raced ?? null;
}

export async function addGenerationWorkItems(attemptId: string, items: readonly Omit<typeof generationWorkItems.$inferInsert, "attemptId">[]) {
  if (items.length === 0) return [];
  return db.insert(generationWorkItems).values(items.map((item) => ({ ...item, attemptId }))).returning();
}

export async function addEvidenceManifest(attemptId: string, items: readonly Omit<typeof generationEvidenceManifestItems.$inferInsert, "attemptId">[]) {
  if (items.length === 0) return [];
  return db.insert(generationEvidenceManifestItems).values(items.map((item) => ({ ...item, attemptId }))).returning();
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
    const attempt = await ownedAttemptIn(transaction, input.userId, input.attemptId);
    if (!attempt || attempt.attempt.status !== "created" || attempt.attempt.estimatedUnits !== input.units) return null;
    await transaction.insert(iuAccounts).values({ userId: input.userId }).onConflictDoNothing();
    const [account] = await transaction.select().from(iuAccounts).where(eq(iuAccounts.userId, input.userId)).for("update");
    if (!account || account.availableUnits < input.units) return null;
    await transaction.update(iuAccounts).set({ availableUnits: sql`${iuAccounts.availableUnits} - ${input.units}`, reservedUnits: sql`${iuAccounts.reservedUnits} + ${input.units}`, updatedAt: new Date() }).where(eq(iuAccounts.userId, input.userId));
    const [entry] = await transaction.insert(iuLedgerEntries).values({ userId: input.userId, attemptId: input.attemptId, kind: "reservation", units: input.units, entitlementPlan: input.entitlementPlan, reason: "generation_attempt_reservation" }).returning();
    await transaction.update(generationAttempts).set({ status: "reserved" }).where(and(eq(generationAttempts.id, input.attemptId), eq(generationAttempts.status, "created")));
    return entry ?? null;
  });
}

export async function settleGenerationUnits(input: { userId: string; attemptId: string; succeeded: boolean; entitlementPlan: string }) {
  return db.transaction(async (transaction) => {
    const attempt = await ownedAttemptIn(transaction, input.userId, input.attemptId);
    if (!attempt) return null;
    const [reservation] = await transaction.select().from(iuLedgerEntries).where(and(eq(iuLedgerEntries.attemptId, input.attemptId), eq(iuLedgerEntries.kind, "reservation"))).limit(1);
    if (!reservation) return null;
    const kind: IuLedgerEntryKind = input.succeeded ? "allocation" : "release";
    const [existing] = await transaction.select().from(iuLedgerEntries).where(and(eq(iuLedgerEntries.attemptId, input.attemptId), eq(iuLedgerEntries.kind, kind))).limit(1);
    if (existing) return existing;
    const [entry] = await transaction.insert(iuLedgerEntries).values({ userId: input.userId, attemptId: input.attemptId, kind, units: reservation.units, entitlementPlan: input.entitlementPlan, reason: input.succeeded ? "generation_attempt_consumption" : "generation_attempt_release" }).returning();
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

export async function appendProviderExecution(input: typeof providerExecutions.$inferInsert) {
  const existing = await db
    .select()
    .from(providerExecutions)
    .where(and(eq(providerExecutions.workItemId, input.workItemId), eq(providerExecutions.sequence, input.sequence)))
    .limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db.insert(providerExecutions).values(input).returning();
  return row ?? null;
}

export async function appendGenerationValidation(input: typeof generationValidations.$inferInsert) {
  const existing = await db
    .select()
    .from(generationValidations)
    .where(and(eq(generationValidations.attemptId, input.attemptId), eq(generationValidations.fingerprint, input.fingerprint), eq(generationValidations.kind, input.kind)))
    .limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db.insert(generationValidations).values(input).returning();
  return row ?? null;
}

export async function appendGeneratedContentVersion(input: typeof generatedContentVersions.$inferInsert) {
  const [row] = await db.insert(generatedContentVersions).values(input).returning();
  return row ?? null;
}

export async function completeGenerationAttempt(input: {
  userId: string;
  attemptId: string;
  entitlementPlan: string;
  artifact: Omit<typeof generatedContentVersions.$inferInsert, "attemptId">;
  compilerValidation: Omit<typeof generationValidations.$inferInsert, "attemptId">;
}) {
  return db.transaction(async (transaction) => {
    const attempt = await ownedAttemptIn(transaction, input.userId, input.attemptId);
    if (!attempt) return null;
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
    if (!reservation) return null;
    const [artifact] = await transaction.insert(generatedContentVersions).values({ ...input.artifact, attemptId: input.attemptId }).returning();
    await transaction.insert(generationValidations).values({ ...input.compilerValidation, attemptId: input.attemptId });
    const [allocation] = await transaction.select().from(iuLedgerEntries).where(and(eq(iuLedgerEntries.attemptId, input.attemptId), eq(iuLedgerEntries.kind, "allocation"))).limit(1);
    if (!allocation) {
      await transaction.insert(iuLedgerEntries).values({ userId: input.userId, attemptId: input.attemptId, kind: "allocation", units: reservation.units, entitlementPlan: input.entitlementPlan, reason: "generation_attempt_consumption" });
    }
    const [account] = await transaction.update(iuAccounts).set({ reservedUnits: sql`${iuAccounts.reservedUnits} - ${reservation.units}`, updatedAt: new Date() }).where(and(eq(iuAccounts.userId, input.userId), sql`${iuAccounts.reservedUnits} >= ${reservation.units}`)).returning();
    if (!account) throw new Error("Reserved Generation units could not be allocated.");
    const [completed] = await transaction.update(generationAttempts).set({ status: "succeeded", completedAt: new Date() }).where(and(eq(generationAttempts.id, input.attemptId), eq(generationAttempts.status, "running"))).returning();
    if (!artifact || !completed) throw new Error("Generation Attempt could not be completed atomically.");
    return { attempt: completed, artifact };
  });
}

export type { AttemptCreate };
export type { ValidationKind, ValidationStatus };
