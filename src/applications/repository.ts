import "server-only";

import { and, asc, eq } from "drizzle-orm";
import type { ApplicationObjective } from "@/applications";
import { db } from "@/auth/database";
import { applicationIntents, applications, type ApplicationStatus } from "./schema";
import { documents } from "@/documents/schema";

export type CreateApplicationInput = {
  objective: ApplicationObjective;
};

function intentValues(objective: ApplicationObjective) {
  return {
    kind: objective.kind,
    targetRole: objective.targetRole,
    organisation: objective.organisation,
    institution: objective.institution,
    programme: objective.programme,
    field: objective.field,
    country: objective.country,
    deadline: objective.deadline,
    requirements: objective.requirements,
    instructions: objective.instructions,
    wordLimit: objective.wordLimit,
    pageLimit: objective.pageLimit,
    requestedDocuments: objective.requestedDocuments,
  };
}

/** Creates an owned application and its normalized intent atomically. */
export async function createApplication(userId: string, input: CreateApplicationInput) {
  return db.transaction(async (transaction) => {
    const [application] = await transaction
      .insert(applications)
      .values({ userId, status: "draft" })
      .returning();

    if (!application) throw new Error("Application could not be created.");

    const [intent] = await transaction
      .insert(applicationIntents)
      .values({ applicationId: application.id, ...intentValues(input.objective) })
      .returning();

    if (!intent) throw new Error("Application intent could not be created.");

    return { ...application, intent };
  });
}

/** Returns only Applications owned by the authenticated user. */
export async function listOwnedApplications(userId: string) {
  return db
    .select()
    .from(applications)
    .where(eq(applications.userId, userId))
    .orderBy(asc(applications.createdAt));
}

/** Ownership is part of the lookup, so another user's Application is not enumerable. */
export async function getOwnedApplication(userId: string, applicationId: string) {
  const [application] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.userId, userId), eq(applications.id, applicationId)));

  return application ?? null;
}

/** Retrieves an owned Application together with its normalized intent and owned Documents. */
export async function getOwnedApplicationWithDocuments(userId: string, applicationId: string) {
  const application = await getOwnedApplication(userId, applicationId);
  if (!application) return null;

  const [intent] = await db
    .select()
    .from(applicationIntents)
    .where(eq(applicationIntents.applicationId, application.id));
  const ownedDocuments = await db
    .select()
    .from(documents)
    .where(and(eq(documents.userId, userId), eq(documents.applicationId, application.id)))
    .orderBy(asc(documents.createdAt));

  return { ...application, intent: intent ?? null, documents: ownedDocuments };
}

/**
 * Associates a document only when both rows belong to the same authenticated user.
 * The compound ownership predicates make cross-user association impossible through this boundary.
 */
export async function associateDocumentWithApplication(
  userId: string,
  documentId: string,
  applicationId: string,
) {
  return db.transaction(async (transaction) => {
    const [application] = await transaction
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)));

    if (!application) return null;

    const [document] = await transaction
      .update(documents)
      .set({ applicationId: application.id, updatedAt: new Date() })
      .where(and(eq(documents.id, documentId), eq(documents.userId, userId)))
      .returning();

    return document ?? null;
  });
}

export type OwnedApplication = Awaited<ReturnType<typeof getOwnedApplication>>;
export type PersistedApplicationStatus = ApplicationStatus;
