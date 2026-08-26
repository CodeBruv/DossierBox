import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/auth/database";
import { applications } from "./schema";
import { requirements } from "./opportunity-schema";
import { gaps, type GapStatus } from "./planning-schema";
import { findOwnedApplication } from "./ownership";

export type CreateGapInput = Omit<typeof gaps.$inferInsert, "id" | "applicationId" | "createdAt" | "updatedAt">;

async function ownedGap(userId: string, gapId: string) {
  const [row] = await db.select({ gap: gaps }).from(gaps).innerJoin(applications, eq(applications.id, gaps.applicationId)).where(and(eq(gaps.id, gapId), eq(applications.userId, userId))).limit(1);
  return row?.gap ?? null;
}

export async function createGap(userId: string, applicationId: string, input: CreateGapInput) {
  if (!(await findOwnedApplication(userId, applicationId))) return null;
  if (input.requirementId) {
    const [requirement] = await db.select({ id: requirements.id, applicationId: requirements.applicationId }).from(requirements).where(eq(requirements.id, input.requirementId)).limit(1);
    if (!requirement || requirement.applicationId !== applicationId) return null;
  }
  const [created] = await db.insert(gaps).values({ ...input, applicationId }).returning();
  return created ?? null;
}

export async function getOwnedGap(userId: string, gapId: string) {
  return ownedGap(userId, gapId);
}

export async function listApplicationGaps(userId: string, applicationId: string) {
  if (!(await findOwnedApplication(userId, applicationId))) return [];
  return db.select().from(gaps).where(eq(gaps.applicationId, applicationId)).orderBy(asc(gaps.createdAt));
}

export async function updateOwnedGap(userId: string, gapId: string, status: GapStatus) {
  const existing = await ownedGap(userId, gapId);
  if (!existing) return null;
  if (existing.status === "resolved" && status !== "resolved") throw new Error("Resolved gaps cannot be reopened through this lifecycle boundary.");
  if (existing.status === "waived" && status !== "waived") throw new Error("Waived gaps cannot be reopened through this lifecycle boundary.");
  const [updated] = await db.update(gaps).set({ status, updatedAt: new Date() }).where(eq(gaps.id, gapId)).returning();
  return updated ?? null;
}

export async function deleteOwnedGap(userId: string, gapId: string) {
  if (!(await ownedGap(userId, gapId))) return false;
  return (await db.delete(gaps).where(eq(gaps.id, gapId)).returning({ id: gaps.id })).length > 0;
}
