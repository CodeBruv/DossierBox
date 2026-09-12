import "server-only";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { ApplicationObjective } from "@/applications";
import {
  applicationPackageMembers,
  applicationPackages,
  applicationPlans,
} from "@/applications/planning-schema";
import { applicationIntents, applications } from "@/applications/schema";
import { db } from "@/auth/database";
import { composeDocument, type ComposedDocument } from "./composition";
import { DEFAULT_PAGE_BREAK_ID } from "./arrangement";
import { documentTypeLabel as catalogueDocumentTypeLabel } from "./catalogue";
import { defaultPresentationStyleFor } from "./presentation";
import { getDossierSnapshot } from "@/profile/repository";
import { documents, type DocumentType } from "./schema";
import { documentVersions } from "./version-schema";

export type DocumentListingVersion = Pick<
  typeof documentVersions.$inferSelect,
  "id" | "version" | "createdAt" | "specification" | "selectedEvidence" | "content" | "provenance" | "configuration"
>;

export type DocumentListingRow = Awaited<ReturnType<typeof listDocuments>>[number];

/**
 * Returns the listing projection and at most one immutable version per document.
 * The second query is owner-scoped and bounded by the first query's ids; composition stays
 * in memory and never invokes the generation or provider paths.
 */
export async function listDocuments(userId: string) {
  const rows = await db
    .select({
      id: documents.id,
      applicationId: documents.applicationId,
      type: documents.type,
      title: documents.title,
      status: documents.status,
      template: documents.template,
      hiddenSections: documents.hiddenSections,
      sectionOrder: documents.sectionOrder,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
      internalApplication: applications.internal,
    })
    .from(documents)
    .leftJoin(applications, eq(applications.id, documents.applicationId))
    .where(eq(documents.userId, userId))
    .orderBy(desc(documents.updatedAt))
    .limit(100);

  if (rows.length === 0) return rows.map((row) => ({ ...row, latestVersion: null, draftComposition: null }));

  const versions = await db
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
    .where(and(eq(documentVersions.userId, userId), inArray(documentVersions.documentId, rows.map((row) => row.id))))
    .orderBy(desc(documentVersions.version));

  const latestByDocument = new Map<string, DocumentListingVersion>();
  for (const version of versions) {
    if (!latestByDocument.has(version.documentId)) latestByDocument.set(version.documentId, version);
  }

  const internalDrafts = rows.filter((row) => row.internalApplication && !latestByDocument.has(row.id));
  const draftSnapshot = internalDrafts.length ? await getDossierSnapshot(userId) : null;
  const draftCompositions = new Map<string, ComposedDocument>();
  if (draftSnapshot) {
    for (const document of internalDrafts) {
      draftCompositions.set(document.id, composeDocument(document.type, draftSnapshot, {
        hiddenSections: document.hiddenSections,
        sectionOrder: document.sectionOrder,
      }));
    }
  }

  return rows.map((row) => ({
    ...row,
    latestVersion: latestByDocument.get(row.id) ?? null,
    draftComposition: draftCompositions.get(row.id) ?? null,
  }));
}

export async function getOwnedDocument(userId: string, documentId: string) {
  const [document] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.userId, userId), eq(documents.id, documentId)));

  return document ?? null;
}

/** Resolves the complete owner-scoped application package member for a document. */
export async function getOwnedDocumentPackageMember(userId: string, documentId: string) {
  const [row] = await db
    .select({
      member: applicationPackageMembers,
      package: applicationPackages,
      plan: applicationPlans,
      application: applications,
    })
    .from(documents)
    .innerJoin(applicationPackageMembers, eq(applicationPackageMembers.documentId, documents.id))
    .innerJoin(applicationPackages, eq(applicationPackages.id, applicationPackageMembers.packageId))
    .innerJoin(applicationPlans, eq(applicationPlans.id, applicationPackages.planId))
    .innerJoin(applications, eq(applications.id, applicationPlans.applicationId))
    .where(and(
      eq(documents.id, documentId),
      eq(documents.userId, userId),
      eq(applications.userId, userId),
      eq(documents.applicationId, applicationPlans.applicationId),
      // `documentType` predates the documents table and is plain text, while
      // documents.type is a PostgreSQL enum. PostgreSQL does not implicitly
      // compare text with an enum, so make the cast explicit at this boundary.
      sql`${applicationPackageMembers.documentType} = cast(${documents.type} as text)`,
    ))
    .limit(1);

  return row ?? null;
}

/**
 * What the create flow decided, beyond the document's type.
 *
 * All fields are optional because the type alone is enough to compose a page, and the
 * create screen fills these in when the user has told it more. `presentationStyle` unset
 * falls back to the family default rather than a global one, so an academic CV never
 * silently opens in a résumé's style.
 */
export type DocumentCreationInput = {
  /** An already-persisted Application is the normal creation boundary. */
  applicationId?: string;
  presentationStyle?: string;
  /** Compatibility snapshot only; normalized Application Intent remains authoritative. */
  objective?: ApplicationObjective | null;
  hiddenSections?: string[];
  sectionOrder?: string[];
  pageBreaks?: string[];
  contentOverrides?: Record<string, unknown>;
};

export async function createDocument(
  userId: string,
  type: DocumentType,
  input: DocumentCreationInput = {},
) {
  const [created] = await db.transaction(async (transaction) => {
    let applicationId: string;
    let objective: ApplicationObjective;

    if (input.applicationId) {
      const [ownedApplication] = await transaction
        .select({ applicationId: applications.id, intent: applicationIntents })
        .from(applications)
        .innerJoin(applicationIntents, eq(applicationIntents.applicationId, applications.id))
        .where(and(eq(applications.id, input.applicationId), eq(applications.userId, userId)))
        .limit(1);

      if (!ownedApplication) return [];
      applicationId = ownedApplication.applicationId;
      objective = objectiveFromIntent(ownedApplication.intent);
    } else {
      // Baseline documents retain an internal general-profile Application so the
      // existing Plan, Package, Specification, and owner-scoped Evidence
      // boundaries can prepare them automatically. This compatibility aggregate
      // is implementation detail and is never presented as a user Application.
      objective = input.objective ?? defaultDocumentObjective();
      const [application] = await transaction
        .insert(applications)
        .values({ userId, status: "draft", internal: true })
        .returning({ id: applications.id });

      if (!application) throw new Error("Application could not be created.");
      applicationId = application.id;
      await transaction.insert(applicationIntents).values({
        applicationId,
        ...intentValues(objective),
      });
    }

    return transaction
      .insert(documents)
      .values({
        userId,
        applicationId,
        type,
        title: documentTitle(type),
        status: "draft",
        template: input.presentationStyle ?? defaultPresentationStyleFor(type),
        hiddenSections: input.hiddenSections ?? [],
        sectionOrder: input.sectionOrder?.length ? input.sectionOrder : [DEFAULT_PAGE_BREAK_ID],
        pageBreaks: [],
        contentOverrides: input.contentOverrides ?? {},
        // This is a derivative compatibility snapshot, never an independently edited authority.
        objective,
      })
      .returning();
  });

  if (!created) {
    throw new Error("Document could not be created.");
  }

  return created;
}

/**
 * Resolves the mutable Document represented by an Application Package Member,
 * creating and attaching it atomically when the approved specification is the
 * first point at which that member needs a workspace.
 */
export async function getOrCreateOwnedMemberDocument(userId: string, memberId: string) {
  return db.transaction(async (transaction) => {
    const [member] = await transaction
      .select({ member: applicationPackageMembers, applicationId: applicationPlans.applicationId })
      .from(applicationPackageMembers)
      .innerJoin(applicationPackages, eq(applicationPackages.id, applicationPackageMembers.packageId))
      .innerJoin(applicationPlans, eq(applicationPlans.id, applicationPackages.planId))
      .innerJoin(applications, eq(applications.id, applicationPlans.applicationId))
      .where(and(eq(applicationPackageMembers.id, memberId), eq(applications.userId, userId)))
      .for("update");

    if (!member || !isDocumentType(member.member.documentType)) return null;

    if (member.member.documentId) {
      const [existing] = await transaction
        .select()
        .from(documents)
        .where(and(eq(documents.id, member.member.documentId), eq(documents.userId, userId)))
        .limit(1);
      return existing?.applicationId === member.applicationId && existing.type === member.member.documentType
        ? existing
        : null;
    }

    const [created] = await transaction
      .insert(documents)
      .values({
        userId,
        applicationId: member.applicationId,
        type: member.member.documentType,
        title: catalogueDocumentTypeLabel(member.member.documentType),
        status: "draft",
        template: defaultPresentationStyleFor(member.member.documentType),
        sectionOrder: [DEFAULT_PAGE_BREAK_ID],
      })
      .returning();
    if (!created) throw new Error("Document could not be created.");

    const [attached] = await transaction
      .update(applicationPackageMembers)
      .set({ documentId: created.id, updatedAt: new Date() })
      .where(and(eq(applicationPackageMembers.id, memberId), isNull(applicationPackageMembers.documentId)))
      .returning({ id: applicationPackageMembers.id });
    if (!attached) throw new Error("Package Member could not be attached to the Document.");
    return created;
  });
}

function isDocumentType(value: string): value is DocumentType {
  return value === "professional_cv" || value === "professional_resume" || value === "academic_cv";
}

export type DocumentConfigurationPatch = {
  title: string;
  presentationStyle: string;
  hiddenSections: string[];
  sectionOrder: string[];
  pageBreaks: string[];
  contentOverrides: Record<string, unknown>;
};

/**
 * Saves what the user configured on a document.
 *
 * The ownership check is in the `where` clause rather than in a preceding read.
 * That is not a shortcut for one fewer query — it is what makes the update
 * atomic. A read-then-write leaves a window in which the row could change
 * between the two statements, and it also means an id belonging to someone else
 * takes a different code path, which is exactly the difference an attacker
 * probes for. Here, a document that is not this user's simply matches no row.
 *
 * Returns the updated row, or null when nothing matched. The caller cannot tell
 * "no such document" from "not yours", which is deliberate: documents stay
 * non-enumerable.
 *
 * Only these four configuration values are writable. `type`, `userId`, `objective` and the
 * timestamps are not in the patch type at all, so no caller can reach them by passing
 * extra keys through from a form.
 */
export async function updateDocumentConfiguration(
  userId: string,
  documentId: string,
  patch: DocumentConfigurationPatch,
) {
  const [document] = await db
    .update(documents)
    .set({
      title: patch.title,
      template: patch.presentationStyle,
      hiddenSections: patch.hiddenSections,
      sectionOrder: patch.sectionOrder,
      pageBreaks: patch.pageBreaks,
      contentOverrides: patch.contentOverrides,
      updatedAt: new Date(),
    })
    .where(and(eq(documents.userId, userId), eq(documents.id, documentId)))
    .returning();

  return document ?? null;
}

/**
 * Deletes one of this user's documents.
 *
 * Ownership lives in the `where` clause for the same reason it does in the update above:
 * a document belonging to someone else matches no row rather than taking a different code
 * path, so nothing here reveals whether an id exists.
 *
 * What this deletes is a derived artifact — a title, a chosen style, a set of hidden
 * sections. The career information it was composed from is in the profile tables and is
 * not touched, which is why deleting a document is a safe thing to offer at all. Returns
 * whether a row was removed so the caller can tell a real deletion from a no-op.
 */
export async function deleteOwnedDocument(userId: string, documentId: string) {
  const deleted = await db
    .delete(documents)
    .where(and(eq(documents.userId, userId), eq(documents.id, documentId)))
    .returning({ id: documents.id });

  return deleted.length > 0;
}

export async function listOwnedDocumentVersions(userId: string, documentId: string) {
  return db
    .select()
    .from(documentVersions)
    .where(and(eq(documentVersions.userId, userId), eq(documentVersions.documentId, documentId)))
    .orderBy(desc(documentVersions.version));
}

/**
 * Resolves an immutable version only after the Document has been authorized.
 *
 * The preliminary version read is scoped to that owned Document and exists solely to distinguish
 * a genuinely legacy Document from corrupt/inconsistent version history. The selected row must
 * then prove the complete Package Member → Package → Plan → Application ownership chain.
 */
export async function getOwnedDocumentReadSource(
  userId: string,
  documentId: string,
  documentVersionId?: string,
) {
  const document = await getOwnedDocument(userId, documentId);
  if (!document) return null;

  const versionScope = and(
    eq(documentVersions.documentId, document.id),
    documentVersionId ? eq(documentVersions.id, documentVersionId) : undefined,
  );
  const [scopedVersion] = await db
    .select({ id: documentVersions.id })
    .from(documentVersions)
    .where(versionScope)
    .orderBy(desc(documentVersions.version))
    .limit(1);

  if (!scopedVersion) {
    const [anyVersion] = documentVersionId
      ? await db
          .select({ id: documentVersions.id })
          .from(documentVersions)
          .where(eq(documentVersions.documentId, document.id))
          .limit(1)
      : [];
    return {
      document,
      state: (documentVersionId || anyVersion ? "version_not_found" : "legacy") as
        | "version_not_found"
        | "legacy",
    };
  }

  const [ownedVersion] = await db
    .select({ version: documentVersions })
    .from(documentVersions)
    .innerJoin(
      documents,
      eq(documents.id, documentVersions.documentId),
    )
    .innerJoin(
      applicationPackageMembers,
      eq(applicationPackageMembers.documentId, documentVersions.documentId),
    )
    .innerJoin(
      applicationPackages,
      eq(applicationPackages.id, applicationPackageMembers.packageId),
    )
    .innerJoin(applicationPlans, eq(applicationPlans.id, applicationPackages.planId))
    .innerJoin(applications, eq(applications.id, applicationPlans.applicationId))
    .where(and(
      eq(documentVersions.id, scopedVersion.id),
      eq(documentVersions.documentId, document.id),
      eq(documentVersions.userId, userId),
      eq(documentVersions.applicationId, applications.id),
      eq(documents.applicationId, applications.id),
      eq(applications.userId, userId),
      // Keep the legacy text column comparison explicit for the same reason as
      // getOwnedDocumentPackageMember: the stored document type is an enum.
      sql`${applicationPackageMembers.documentType} = cast(${documents.type} as text)`,
    ))
    .limit(1);

  return ownedVersion
    ? { document, state: "version" as const, version: ownedVersion.version }
    : { document, state: "invalid_version_history" as const };
}

/** @deprecated Use getOwnedDocumentReadSource for Document-scoped version reads. */
export async function getOwnedDocumentVersion(userId: string, documentVersionId: string) {
  const [version] = await db
    .select()
    .from(documentVersions)
    .where(and(eq(documentVersions.userId, userId), eq(documentVersions.id, documentVersionId)))
    .limit(1);

  return version ?? null;
}

/**
 * The document's label, from the catalogue.
 *
 * Re-exported through the repository because call sites already import it from here.
 * It used to be a `switch` over the three enum values, which meant a fourth document
 * type would have needed a code change in a database module — exactly the coupling the
 * catalogue exists to remove.
 */
export function documentTypeLabel(type: DocumentType) {
  return catalogueDocumentTypeLabel(type);
}

function documentTitle(type: DocumentType) {
  return documentTypeLabel(type);
}

function defaultDocumentObjective(): ApplicationObjective {
  return {
    kind: "general_profile",
    targetRole: null,
    organisation: null,
    institution: null,
    programme: null,
    field: null,
    country: null,
    deadline: null,
    requirements: null,
    instructions: null,
    wordLimit: null,
    pageLimit: null,
    requestedDocuments: [],
  };
}

function objectiveFromIntent(intent: typeof applicationIntents.$inferSelect): ApplicationObjective {
  return {
    kind: intent.kind as ApplicationObjective["kind"],
    targetRole: intent.targetRole,
    organisation: intent.organisation,
    institution: intent.institution,
    programme: intent.programme,
    field: intent.field,
    country: intent.country,
    deadline: intent.deadline,
    requirements: intent.requirements,
    instructions: intent.instructions,
    wordLimit: intent.wordLimit,
    pageLimit: intent.pageLimit,
    requestedDocuments: intent.requestedDocuments,
  };
}

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
