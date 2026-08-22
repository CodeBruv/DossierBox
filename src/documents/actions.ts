"use server";

import { redirect, unstable_rethrow } from "next/navigation";
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
  let document: Awaited<ReturnType<typeof createDocument>>;

  try {
    document = await createDocument(user.id, type as DocumentType);
  } catch (error) {
    /**
     * `redirect()` and `notFound()` signal control flow by throwing. Any such
     * throw raised beneath this call must be re-thrown untouched, or the
     * framework never performs the navigation and — worse — a successful
     * operation gets logged as a failure. `unstable_rethrow` is Next's own
     * guard for this and recognises every internal digest, so it stays correct
     * if the framework adds new ones.
     *
     * Everything reaching the lines below is therefore a genuine fault.
     */
    unstable_rethrow(error);
    console.error("[documents] Failed to create document draft", error);
    redirect("/documents/new?error=create-failed");
  }

  redirect(`/documents/${document.id}`);
}
