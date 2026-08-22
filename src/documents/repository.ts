import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/auth/database";
import { defaultTemplateFor } from "./presentation";
import { documents, type DocumentType } from "./schema";

export async function listDocuments(userId: string) {
  return db
    .select()
    .from(documents)
    .where(eq(documents.userId, userId))
    .orderBy(desc(documents.updatedAt));
}

export async function getOwnedDocument(userId: string, documentId: string) {
  const [document] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.userId, userId), eq(documents.id, documentId)));

  return document ?? null;
}

export async function createDocument(userId: string, type: DocumentType) {
  const [document] = await db
    .insert(documents)
    .values({
      userId,
      type,
      title: documentTitle(type),
      status: "draft",
      template: defaultTemplateFor(type),
    })
    .returning();

  if (!document) {
    throw new Error("Document could not be created.");
  }

  return document;
}

export type DocumentConfigurationPatch = {
  title: string;
  template: string;
  hiddenSections: string[];
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
 * Only these three columns are writable. `type`, `userId` and the timestamps are
 * not in the patch type at all, so no caller can reach them by passing extra
 * keys through from a form.
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
      template: patch.template,
      hiddenSections: patch.hiddenSections,
      updatedAt: new Date(),
    })
    .where(and(eq(documents.userId, userId), eq(documents.id, documentId)))
    .returning();

  return document ?? null;
}

export function documentTypeLabel(type: DocumentType) {
  switch (type) {
    case "professional_cv":
      return "Professional CV";
    case "professional_resume":
      return "Professional résumé";
    case "academic_cv":
      return "Academic or international CV";
  }
}

function documentTitle(type: DocumentType) {
  return `${documentTypeLabel(type)} draft`;
}
