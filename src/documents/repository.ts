import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/auth/database";
import { documentTypeLabel as catalogueDocumentTypeLabel } from "./catalogue";
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
  return `${documentTypeLabel(type)} draft`;
}
