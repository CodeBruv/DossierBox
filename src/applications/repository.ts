import "server-only";

import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { ApplicationObjective } from "@/applications";
import { db } from "@/auth/database";
import { applicationIntents, applications, type ApplicationStatus } from "./schema";
import { documents } from "@/documents/schema";
import { documentVersions } from "@/documents/version-schema";

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

export type HistoryVersion = Pick<typeof documentVersions.$inferSelect, "id" | "version" | "createdAt" | "specification" | "selectedEvidence" | "content" | "provenance" | "configuration">;

export type HistoryDocument = {
  document: Pick<typeof documents.$inferSelect, "id" | "type" | "title" | "status" | "template" | "createdAt" | "updatedAt">;
  application: Pick<typeof applications.$inferSelect, "id" | "status" | "createdAt" | "updatedAt"> | null;
  intent: Pick<typeof applicationIntents.$inferSelect, "kind" | "targetRole" | "organisation" | "institution" | "programme"> | null;
  versions: HistoryVersion[];
};

/**
 * Returns the signed-in user's visible document history in bounded projections.
 * Internal compatibility Applications are excluded while standalone Documents remain visible.
 */
export async function listOwnedHistory(userId: string): Promise<HistoryDocument[]> {
  const rows = await db
    .select({
      document: {
        id: documents.id,
        type: documents.type,
        title: documents.title,
        status: documents.status,
        template: documents.template,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
      },
      application: {
        id: applications.id,
        status: applications.status,
        createdAt: applications.createdAt,
        updatedAt: applications.updatedAt,
      },
      intent: {
        kind: applicationIntents.kind,
        targetRole: applicationIntents.targetRole,
        organisation: applicationIntents.organisation,
        institution: applicationIntents.institution,
        programme: applicationIntents.programme,
      },
    })
    .from(documents)
    .leftJoin(applications, eq(applications.id, documents.applicationId))
    .leftJoin(applicationIntents, eq(applicationIntents.applicationId, applications.id))
    .where(and(eq(documents.userId, userId), or(isNull(documents.applicationId), eq(applications.internal, false))))
    .orderBy(desc(documents.updatedAt))
    .limit(100);

  const documentIds = rows.map((row) => row.document.id);
  const versions = documentIds.length
    ? await db
        .select({
          id: documentVersions.id,
          documentId: documentVersions.documentId,
          version: documentVersions.version,
          createdAt: documentVersions.createdAt,
          specification: documentVersions.specification,
          selectedEvidence: documentVersions.selectedEvidence,
          content: documentVersions.content,
          provenance: documentVersions.provenance,
          configuration: documentVersions.configuration,
        })
        .from(documentVersions)
        .where(and(eq(documentVersions.userId, userId), inArray(documentVersions.documentId, documentIds)))
        .orderBy(desc(documentVersions.createdAt))
    : [];
  const versionsByDocument = new Map<string, HistoryDocument["versions"]>();
  for (const version of versions) {
    const existing = versionsByDocument.get(version.documentId) ?? [];
    existing.push({
      id: version.id,
      version: version.version,
      createdAt: version.createdAt,
      specification: version.specification,
      selectedEvidence: version.selectedEvidence,
      content: version.content,
      provenance: version.provenance,
      configuration: version.configuration,
    });
    versionsByDocument.set(version.documentId, existing);
  }

  return rows.map((row) => ({
    document: row.document,
    application: row.application?.id ? row.application : null,
    intent: row.intent?.kind ? row.intent : null,
    versions: versionsByDocument.get(row.document.id) ?? [],
  }));
}

/** Returns only Applications owned by the authenticated user. */
export async function listOwnedApplications(userId: string) {
  return db
    .select()
    .from(applications)
    .where(and(eq(applications.userId, userId), eq(applications.internal, false)))
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

/** Retrieves an owned Application and its normalized Intent without loading downstream resources. */
export async function getOwnedApplicationWithIntent(userId: string, applicationId: string) {
  const application = await getOwnedApplication(userId, applicationId);
  if (!application) return null;

  const [intent] = await db
    .select()
    .from(applicationIntents)
    .where(eq(applicationIntents.applicationId, application.id));

  return { ...application, intent: intent ?? null };
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
