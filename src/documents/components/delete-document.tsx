/**
 * Deleting a document.
 *
 * Two deliberate actions, never one. The first opens the confirmation and does nothing
 * else; the second performs the deletion. `<details>` gives that for free with no client
 * JavaScript, which keeps this consistent with the rest of the document controls and means
 * the safety step does not depend on a script having loaded. `window.confirm` would be one
 * line, and would be a dialog the user cannot read properly, cannot style, and does not
 * get at all if hydration has not finished.
 *
 * What the confirmation says matters as much as its existence. "Delete" next to a career
 * document reads as "delete my work", so the text states the fact that makes this safe:
 * the document is composed from the dossier, and the dossier is untouched. The document
 * is also named, because a user with three drafts needs to know which one this is.
 */

import { deleteDocumentAction } from "../actions";
import styles from "@/styles/ui/document-settings.module.css";

export type DeleteDocumentProps = {
  documentId: string;
  title: string;
};

export function DeleteDocument({ documentId, title }: DeleteDocumentProps) {
  return (
    <details className={styles.deletePanel}>
      <summary className={styles.deleteSummary}>Delete this document</summary>
      <div className={styles.deleteBody}>
        <p>
          <strong>{title}</strong> will be removed permanently. Your dossier is not
          affected — your experience, education and everything else stay exactly as they
          are, and you can compose a new document from them at any time.
        </p>
        <form action={deleteDocumentAction}>
          <input type="hidden" name="documentId" value={documentId} />
          <button className={styles.deleteConfirm} type="submit">
            Delete permanently
          </button>
        </form>
      </div>
    </details>
  );
}
