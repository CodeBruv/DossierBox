import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/auth/database";
import { isDocumentTypeKey, type DocumentTypeKey } from "@/documents/catalogue";
import { documents } from "@/documents/schema";
import { applications } from "./schema";
import { applicationPackageMembers, applicationPackages, applicationPlans } from "./planning-schema";

async function ownedPlan(userId: string, planId: string) {
  const [row] = await db.select({ plan: applicationPlans, applicationId: applications.id }).from(applicationPlans).innerJoin(applications, eq(applications.id, applicationPlans.applicationId)).where(and(eq(applicationPlans.id, planId), eq(applications.userId, userId))).limit(1);
  return row ?? null;
}

async function ownedPackage(userId: string, packageId: string) {
  const [row] = await db.select({ package: applicationPackages, applicationId: applicationPlans.applicationId }).from(applicationPackages).innerJoin(applicationPlans, eq(applicationPlans.id, applicationPackages.planId)).innerJoin(applications, eq(applications.id, applicationPlans.applicationId)).where(and(eq(applicationPackages.id, packageId), eq(applications.userId, userId))).limit(1);
  return row ?? null;
}

async function ownedMember(userId: string, memberId: string) {
  const [row] = await db.select({ member: applicationPackageMembers, applicationId: applicationPlans.applicationId }).from(applicationPackageMembers).innerJoin(applicationPackages, eq(applicationPackages.id, applicationPackageMembers.packageId)).innerJoin(applicationPlans, eq(applicationPlans.id, applicationPackages.planId)).innerJoin(applications, eq(applications.id, applicationPlans.applicationId)).where(and(eq(applicationPackageMembers.id, memberId), eq(applications.userId, userId))).limit(1);
  return row ?? null;
}

export async function createApplicationPackage(userId: string, planId: string, input: Pick<typeof applicationPackages.$inferInsert, "status" | "confirmation"> = { status: "draft", confirmation: "unconfirmed" }) {
  if (!(await ownedPlan(userId, planId))) return null;
  const [created] = await db.insert(applicationPackages).values({ ...input, planId }).returning();
  return created ?? null;
}

export async function getOwnedApplicationPackage(userId: string, packageId: string) {
  return (await ownedPackage(userId, packageId))?.package ?? null;
}

export async function updateOwnedApplicationPackage(userId: string, packageId: string, input: Partial<Pick<typeof applicationPackages.$inferInsert, "status" | "confirmation">>) {
  if (!(await ownedPackage(userId, packageId))) return null;
  const [updated] = await db.update(applicationPackages).set({ ...input, updatedAt: new Date() }).where(eq(applicationPackages.id, packageId)).returning();
  return updated ?? null;
}

export type CreatePackageMemberInput = Omit<typeof applicationPackageMembers.$inferInsert, "id" | "packageId" | "createdAt" | "updatedAt"> & { documentType: DocumentTypeKey };

export async function createPackageMember(userId: string, packageId: string, input: CreatePackageMemberInput) {
  const owned = await ownedPackage(userId, packageId);
  if (!owned || !isDocumentTypeKey(input.documentType)) return null;
  if (input.documentId) {
    const [document] = await db.select({ id: documents.id, applicationId: documents.applicationId, type: documents.type }).from(documents).where(and(eq(documents.id, input.documentId), eq(documents.userId, userId))).limit(1);
    if (!document || document.applicationId !== owned.applicationId || document.type !== input.documentType) return null;
  }
  const [created] = await db.insert(applicationPackageMembers).values({ ...input, packageId }).returning();
  return created ?? null;
}

export async function listPackageMembers(userId: string, packageId: string) {
  if (!(await ownedPackage(userId, packageId))) return [];
  return db.select().from(applicationPackageMembers).where(eq(applicationPackageMembers.packageId, packageId)).orderBy(asc(applicationPackageMembers.position));
}

export async function updateOwnedPackageMember(userId: string, memberId: string, input: Partial<Pick<typeof applicationPackageMembers.$inferInsert, "role" | "position" | "availability" | "specificationStatus" | "completion">>) {
  if (!(await ownedMember(userId, memberId))) return null;
  const [updated] = await db.update(applicationPackageMembers).set({ ...input, updatedAt: new Date() }).where(eq(applicationPackageMembers.id, memberId)).returning();
  return updated ?? null;
}

export async function deleteOwnedPackageMember(userId: string, memberId: string) {
  if (!(await ownedMember(userId, memberId))) return false;
  return (await db.delete(applicationPackageMembers).where(eq(applicationPackageMembers.id, memberId)).returning({ id: applicationPackageMembers.id })).length > 0;
}
