import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/auth/database";
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
    })
    .returning();

  if (!document) {
    throw new Error("Document could not be created.");
  }

  return document;
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
