"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireProfileUser } from "@/profile/authorization";
import {
  createSectionEntries,
  getOrCreateProfile,
  updateProfileBasics,
  type SectionEntryInput,
} from "@/profile/repository";
import { parseEntryValues, profileBasicsSchema } from "@/profile/validation";
import { readCandidates, type ImportResult } from "./candidates";
import { detectFormat, unsupportedFormatMessage, MAX_UPLOAD_BYTES } from "./detect";
import { extractDocxLines } from "./extract/docx";
import { extractPdfLines } from "./extract/pdf";
import { DocumentFormatError, type ExtractedLine } from "./extract/line";
import {
  createDocumentImport,
  deleteOwnedDocumentImport,
  getOwnedDocumentImport,
} from "./repository";
import {
  collectImportSelection,
  importBasicsFields,
  importFieldName,
  IMPORT_BASICS_ROW,
  IMPORT_ROW_LEVEL_FIELD,
} from "./review";
import { initialImportFormState, type ImportFormState } from "./state";

/**
 * Reading an uploaded document, and committing what the user confirmed.
 *
 * The two halves are deliberately two requests with a stored reading between them, and the
 * reason is the product rule that extracted information is never written to a dossier without
 * being seen. If reading and writing happened in one request there would be nowhere to put the
 * review, and the only implementable behaviour would be the forbidden one.
 *
 * Nothing here trusts the browser. The file's declared type is ignored in favour of its bytes;
 * the import id is scoped by owner inside the query rather than compared afterwards; the
 * candidates a submission may commit come from the stored reading rather than from the field
 * names in the request; and every value is checked by the dossier's own schemas before it
 * reaches a table — the same schemas that would have run had the user typed it.
 *
 * The uploaded file is never stored. It is read in the request that carried it and then
 * discarded, so an abandoned import leaves the extracted proposals and no copy of the
 * document.
 */

const uploadFailureMessage =
  "We could not read that document just now. Nothing in your dossier was changed. Try again.";

const commitFailureMessage =
  "We could not add that information just now. Nothing in your dossier was changed. Try again.";

export async function scanCareerDocumentAction(
  _previous: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const file = formData.get("document");

  if (!(file instanceof File) || file.size === 0) {
    return error("Choose a PDF or Word document to scan.");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return error(
      `That file is larger than ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB. Upload a smaller PDF or Word document.`,
    );
  }

  const user = await requireProfileUser();

  let result: ImportResult;

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const detection = detectFormat(bytes);

    if (detection.kind !== "pdf" && detection.kind !== "docx") {
      return error(unsupportedFormatMessage(detection));
    }

    let lines: readonly ExtractedLine[];

    try {
      lines =
        detection.kind === "pdf" ? extractPdfLines(bytes) : extractDocxLines(bytes);
    } catch (readError) {
      /*
       * A `DocumentFormatError` is already written for the person who uploaded the file —
       * "this PDF is password protected", "save it as .docx" — so it is shown as it is.
       * Anything else is a fault on our side and gets the generic message plus a log.
       */
      if (readError instanceof DocumentFormatError) {
        return error(readError.message);
      }
      throw readError;
    }

    result = readCandidates(lines);

    if (result.candidates.length === 0 && Object.keys(result.basics.values).length === 0) {
      return error(
        "We read that document but could not find career information in it. It may be a scan or an image rather than text. You can add your information directly instead.",
      );
    }

    const importId = await createDocumentImport({
      userId: user.id,
      filename: safeFilename(file.name),
      format: detection.kind,
      result,
    });

    redirect(`/profile/import/${importId}`);
  } catch (caught) {
    unstable_rethrow(caught);
    console.error("[import] Failed to scan an uploaded career document", caught);
    return error(uploadFailureMessage);
  }
}

/**
 * Commits the rows the user ticked, or none of them.
 *
 * Every row is validated before any row is written, and the writes then run in one
 * transaction. That ordering is the whole design: a submission that fails leaves the dossier
 * exactly as it was and the reading still available to correct, so trying again cannot
 * duplicate what already landed.
 *
 * The person's own details are *merged* rather than assigned. Saving basics overwrites every
 * column, so an imported document that happened to omit a phone number would otherwise erase
 * one the user had already entered. A blank imported value keeps what is there; a filled one
 * replaces it, because the user just looked at it and confirmed it.
 */
export async function confirmDocumentImportAction(
  importId: string,
  _previous: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const user = await requireProfileUser();

  const stored = await getOwnedDocumentImport(user.id, importId);

  if (!stored) {
    return error(
      "That scanned document is no longer available. Upload it again to review it.",
    );
  }

  const selection = collectImportSelection(stored.result, formData);

  if (selection.basics === null && selection.entries.length === 0) {
    return error("Tick at least one item to add it to your dossier, or discard the import.");
  }

  const fieldErrors: Record<string, string[]> = {};
  const rowsWithErrors = new Set<string>();
  const entries: SectionEntryInput[] = [];

  for (const entry of selection.entries) {
    const parsed = parseEntryValues(entry.section, { ...entry.values });

    if (!parsed.success) {
      rowsWithErrors.add(entry.rowId);
      collectFieldErrors(fieldErrors, entry.rowId, parsed.error);
      continue;
    }

    entries.push({ section: entry.section, values: parsed.data as Record<string, unknown> });
  }

  try {
    const profile = await getOrCreateProfile(user.id, user);
    let basics: z.infer<typeof profileBasicsSchema> | null = null;

    if (selection.basics !== null) {
      const merged = mergeBasics(selection.basics, profile);
      const parsed = profileBasicsSchema.safeParse(merged);

      if (!parsed.success) {
        rowsWithErrors.add(IMPORT_BASICS_ROW);
        collectFieldErrors(fieldErrors, IMPORT_BASICS_ROW, parsed.error);
      } else {
        basics = parsed.data;
      }
    }

    if (rowsWithErrors.size > 0) {
      return {
        status: "error",
        message:
          rowsWithErrors.size === 1
            ? "One item needs a correction before it can be added. Nothing has been added yet."
            : `${rowsWithErrors.size} items need a correction before they can be added. Nothing has been added yet.`,
        fieldErrors,
        rowsWithErrors: [...rowsWithErrors],
      };
    }

    if (basics) {
      await updateProfileBasics(user.id, basics);
    }

    await createSectionEntries(profile.id, entries);
    await deleteOwnedDocumentImport(user.id, importId);
  } catch (caught) {
    unstable_rethrow(caught);
    console.error(`[import] Failed to commit import ${importId}`, caught);
    return error(commitFailureMessage);
  }

  revalidateDossierPaths();
  redirect(`/profile?status=imported&added=${entries.length}`);
}

/**
 * Throws away a reading without importing it.
 *
 * Offered plainly rather than hidden, because the alternative to a visible discard is a user
 * who does not trust the feature leaving their document sitting in our database. The dossier
 * is not touched: this deletes proposals, not information.
 */
export async function discardDocumentImportAction(formData: FormData): Promise<void> {
  const importId = formData.get("importId");

  if (typeof importId !== "string" || importId.length === 0) {
    redirect("/profile/import");
  }

  const user = await requireProfileUser();

  try {
    await deleteOwnedDocumentImport(user.id, importId);
  } catch (caught) {
    unstable_rethrow(caught);
    console.error(`[import] Failed to discard import ${importId}`, caught);
    redirect(`/profile/import/${importId}?error=discard-failed`);
  }

  redirect("/profile/import?status=discarded");
}

/* Helpers --------------------------------------------------------------------- */

function error(message: string): ImportFormState {
  return { ...initialImportFormState, status: "error", message };
}

/**
 * Imported details laid over the profile, without erasing anything.
 *
 * Every basics column is present in the result, because the schema requires all of them and
 * an absent key would fail validation rather than be left alone. A field the review screen did
 * not show, or showed empty, resolves to whatever the profile already holds.
 */
function mergeBasics(
  submitted: Readonly<Record<string, string>>,
  profile: Record<string, unknown>,
): Record<string, string> {
  const merged: Record<string, string> = {};

  for (const field of importBasicsFields()) {
    const incoming = submitted[field.name]?.trim() ?? "";
    const existing = profile[field.name];

    merged[field.name] =
      incoming.length > 0 ? incoming : typeof existing === "string" ? existing : "";
  }

  return merged;
}

/**
 * Zod's issues, re-keyed to the form the user is looking at.
 *
 * The schema knows the field as `organization`; the review form has fifteen of those, named
 * `field.experience.3.organization`. Without the re-keying, one bad row would show its error
 * under every row.
 *
 * Issues are read from `issues` rather than through `flattenError` because a cross-field rule
 * raises an issue with no field to blame, and it still has to appear somewhere the user can
 * see it. An empty path is filed against the row instead of being dropped.
 */
function collectFieldErrors(
  target: Record<string, string[]>,
  rowId: string,
  zodError: z.ZodError,
): void {
  for (const issue of zodError.issues) {
    const [first] = issue.path;
    const key = importFieldName(
      rowId,
      typeof first === "string" ? first : IMPORT_ROW_LEVEL_FIELD,
    );

    (target[key] ??= []).push(issue.message);
  }
}

/**
 * The filename, shown back to the user and nothing more.
 *
 * It is never used to open, write or serve anything, so the risk here is display rather than
 * traversal: any directory component is dropped because a browser that sent one is telling us
 * about its own filesystem, control characters are removed because they can reorder rendered
 * text, and the length is bounded.
 */
function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim();

  return cleaned.length > 0 ? cleaned.slice(0, 120) : "your document";
}

/**
 * Everything whose content is derived from the dossier.
 *
 * An import can add to any section and change the person's own details, so it invalidates the
 * same set a dossier save does — including the documents, which hold no copy of the dossier
 * and are composed from it on every render.
 */
function revalidateDossierPaths(): void {
  revalidatePath("/profile");
  revalidatePath("/profile/basics");
  revalidatePath("/profile/sections");
  revalidatePath("/profile/review");
  revalidatePath("/profile/[section]", "page");
  revalidatePath("/home");
  revalidatePath("/documents");
  revalidatePath("/documents/[documentId]", "page");
}
