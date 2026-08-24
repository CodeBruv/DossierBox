/**
 * What an import screen renders after a submission.
 *
 * Separate from the profile's own form state because an import fails differently. A dossier
 * form re-renders holding what the user typed; an import cannot — the file is gone once the
 * request that carried it has ended, and the twenty rows being reviewed are held in the
 * database rather than in the submission. So the state carries messages and per-field errors
 * and nothing else, and the screen re-renders from the stored reading.
 *
 * Field errors are keyed by the *prefixed* form names, so the review screen can put "Add the
 * organization" under the third experience rather than under all of them.
 */

export type ImportFormState = {
  readonly status: "idle" | "error";
  readonly message?: string;
  /** Keyed by prefixed field name — see `importFieldName`. */
  readonly fieldErrors?: Record<string, string[]>;
  /** Row ids that failed validation, so a collapsed row can be opened to show why. */
  readonly rowsWithErrors?: string[];
};

export const initialImportFormState: ImportFormState = { status: "idle" };
