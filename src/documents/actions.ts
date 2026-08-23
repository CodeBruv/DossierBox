"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { requireProfileUser } from "@/profile/authorization";
import { isAvailableDocumentType, isDocumentSectionKey } from "./catalogue";
import { isDocumentTemplateId } from "./presentation";
import { createDocument, updateDocumentConfiguration } from "./repository";

/**
 * A document title has to fit a heading and a filename, and nothing useful is
 * expressed past this. Enforced on the server because the input's `maxLength` is
 * a convenience for typing, not a limit anyone has to respect.
 */
const TITLE_MAX_LENGTH = 120;

export async function createDocumentAction(formData: FormData) {
  const type = formData.get("type");
  /**
   * `isAvailableDocumentType`, not merely "is a registered type": the catalogue is
   * allowed to describe document types the engine cannot yet produce, and a posted
   * `type` naming one of those must be refused here rather than reaching the database.
   * A server action is a public endpoint; the form it was rendered into proves nothing
   * about what was posted.
   */
  if (!isAvailableDocumentType(type)) {
    redirect("/documents/new?error=unsupported-type");
  }

  const user = await requireProfileUser();
  let document: Awaited<ReturnType<typeof createDocument>>;

  try {
    document = await createDocument(user.id, type);
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

/**
 * Saves the document's title, style and section visibility.
 *
 * Everything arriving here is treated as untrusted, including the document id:
 * a server action is a public endpoint, and the form it was rendered into proves
 * nothing about what was posted. So the title is bounded, the template must be a
 * template this build knows, unrecognised section keys are dropped rather than
 * stored, and ownership is enforced inside the update's `where` clause.
 *
 * Dropping unknown keys instead of rejecting the whole submission is deliberate:
 * the failure mode of a stale form is then a saved document with one toggle
 * ignored, not a user's renamed title thrown away.
 */
export async function updateDocumentAction(formData: FormData) {
  const documentId = formData.get("documentId");
  if (typeof documentId !== "string" || documentId.length === 0) {
    redirect("/documents?error=unknown-document");
  }

  const rawTitle = formData.get("title");
  const title = typeof rawTitle === "string" ? rawTitle.trim().slice(0, TITLE_MAX_LENGTH) : "";
  if (title.length === 0) {
    redirect(`/documents/${documentId}?error=title-required`);
  }

  const rawTemplate = formData.get("template");
  /*
   * A template this build knows — and nothing more than that, deliberately.
   *
   * The style picker now offers only styles that suit the document's type, and a check on
   * the *form* is never a check at all: this is a public endpoint. The reason the pairing is
   * not verified here is that verifying it needs the document's type, which needs a read,
   * which adds a round trip to a save path already measured at seconds. The guarantee is
   * enforced at the point where a bad pairing would do damage instead: `resolveTemplate`
   * falls back when a stored style does not suit the document, so the worst a hostile post
   * achieves is its own document rendering in the default style. When a style ships that
   * cannot present a CV, this check becomes worth its round trip.
   */
  if (!isDocumentTemplateId(rawTemplate)) {
    redirect(`/documents/${documentId}?error=unknown-template`);
  }

  /*
   * The checkboxes name the sections to *show*, because an unchecked box posts
   * nothing at all — so the sections to hide are what is missing from the form,
   * and that can only be worked out against the full list. `visible` therefore
   * carries every section the form offered, and `hidden` is the difference.
   */
  const offered = formData.getAll("offered").filter(isKnownSection);
  const visible = new Set(formData.getAll("visible").filter(isKnownSection));
  const hiddenSections = offered.filter((key) => !visible.has(key));

  const user = await requireProfileUser();

  try {
    const saved = await updateDocumentConfiguration(user.id, documentId, {
      title,
      template: rawTemplate,
      hiddenSections,
    });

    /*
     * No row matched, so this document either does not exist or is not this
     * user's. Both are answered identically, and with the list rather than a
     * 404 on the id, so nothing here confirms whether the id is real.
     */
    if (!saved) redirect("/documents?error=unknown-document");
  } catch (error) {
    unstable_rethrow(error);
    console.error(`[documents] Failed to save configuration for ${documentId}`, error);
    redirect(`/documents/${documentId}?error=save-failed`);
  }

  redirect(`/documents/${documentId}?status=saved`);
}

function isKnownSection(value: FormDataEntryValue): value is string {
  return isDocumentSectionKey(value);
}
