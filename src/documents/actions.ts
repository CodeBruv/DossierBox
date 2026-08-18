"use server";

import { redirect } from "next/navigation";
import { requireProfileUser } from "@/profile/authorization";
import { createDocument } from "./repository";
import type { DocumentType } from "./schema";

const documentTypes = new Set<DocumentType>([
  "professional_cv",
  "professional_resume",
  "academic_cv",
]);

export async function createDocumentAction(formData: FormData) {
  const type = formData.get("type");
  if (typeof type !== "string" || !documentTypes.has(type as DocumentType)) {
    redirect("/documents/new?error=unsupported-type");
  }

  const user = await requireProfileUser();
  const document = await createDocument(user.id, type as DocumentType);
  redirect(`/documents/${document.id}`);
}
