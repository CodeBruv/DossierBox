import "server-only";

import { and, asc, desc, eq, max } from "drizzle-orm";
import { db } from "@/auth/database";
import { applications } from "./schema";
import { applicationPlans, type PlanStatus } from "./planning-schema";
import { findOwnedApplication } from "./ownership";

export type CreatePlanInput = Omit<typeof applicationPlans.$inferInsert, "id" | "applicationId" | "version" | "createdAt" | "updatedAt">;

async function ownedPlan(userId: string, planId: string) {
  const [row] = await db.select({ plan: applicationPlans, applicationId: applications.id }).from(applicationPlans).innerJoin(applications, eq(applications.id, applicationPlans.applicationId)).where(and(eq(applicationPlans.id, planId), eq(applications.userId, userId))).limit(1);
  return row ?? null;
}

export async function createApplicationPlan(userId: string, applicationId: string, input: CreatePlanInput) {
  if (!(await findOwnedApplication(userId, applicationId))) return null;
  const [latest] = await db.select({ version: max(applicationPlans.version) }).from(applicationPlans).where(eq(applicationPlans.applicationId, applicationId));
  const [created] = await db.insert(applicationPlans).values({ ...input, applicationId, version: Number(latest?.version ?? 0) + 1 }).returning();
  return created ?? null;
}

export async function getOwnedApplicationPlan(userId: string, planId: string) {
  return (await ownedPlan(userId, planId))?.plan ?? null;
}

export async function listApplicationPlans(userId: string, applicationId: string) {
  if (!(await findOwnedApplication(userId, applicationId))) return [];
  return db.select().from(applicationPlans).where(eq(applicationPlans.applicationId, applicationId)).orderBy(desc(applicationPlans.version));
}

export async function updateOwnedApplicationPlan(userId: string, planId: string, input: Partial<Pick<typeof applicationPlans.$inferInsert, "status" | "resolutionSource" | "confirmation" | "recommendedDocuments" | "requirementCoverage" | "evidenceCoverage" | "gapsSummary">>) {
  if (!(await ownedPlan(userId, planId))) return null;
  const [updated] = await db.update(applicationPlans).set({ ...input, updatedAt: new Date() }).where(eq(applicationPlans.id, planId)).returning();
  return updated ?? null;
}

export async function deleteOwnedApplicationPlan(userId: string, planId: string) {
  if (!(await ownedPlan(userId, planId))) return false;
  return (await db.delete(applicationPlans).where(eq(applicationPlans.id, planId)).returning({ id: applicationPlans.id })).length > 0;
}

export type ApplicationPlanStatus = PlanStatus;
