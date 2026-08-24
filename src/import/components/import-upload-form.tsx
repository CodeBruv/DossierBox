"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { scanCareerDocumentAction } from "../actions";
import { initialImportFormState } from "../state";
import styles from "@/styles/pages/import.module.css";

type ImportUploadFormProps = {
  /** Shown as the maximum, so the limit is stated before a file is rejected for exceeding it. */
  maxBytes: number;
};

/**
 * Choosing a document to read.
 *
 * The file is checked twice, and the two checks are not the same check. Here the browser is
 * asked to filter what it offers and the size is compared before an upload starts, so the user
 * is not made to wait to be told no. On the server the *bytes* decide, because the accept
 * attribute and the declared type both come from whoever is uploading. Nothing here is a
 * security boundary; it is only a faster way to say something the server would say anyway.
 */
export function ImportUploadForm({ maxBytes }: ImportUploadFormProps) {
  const [form, formAction, pending] = useActionState(
    scanCareerDocumentAction,
    initialImportFormState,
  );

  const [chosen, setChosen] = useState<string | null>(null);
  const [tooLarge, setTooLarge] = useState(false);

  const megabytes = Math.floor(maxBytes / (1024 * 1024));

  return (
    <form action={formAction} className={styles.uploadForm}>
      {form.message ? (
        <div className={styles.errorSummary} role="alert">
          {form.message}
        </div>
      ) : null}

      {tooLarge ? (
        <div className={styles.errorSummary} role="alert">
          That file is larger than {megabytes} MB. Choose a smaller PDF or Word document.
        </div>
      ) : null}

      <div className={styles.dropField}>
        <label className={styles.fileLabel} htmlFor="document">
          <span className={styles.fileLabelTitle}>Choose your document</span>
          <span className={styles.fileLabelHint}>
            PDF or Word (.docx), up to {megabytes} MB
          </span>
        </label>
        <input
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className={styles.fileInput}
          id="document"
          name="document"
          onChange={(event) => {
            const file = event.target.files?.[0];
            setChosen(file ? file.name : null);
            setTooLarge(Boolean(file && file.size > maxBytes));
          }}
          required
          type="file"
        />
        {chosen ? <p className={styles.chosenFile}>Selected: {chosen}</p> : null}
      </div>

      <div className={styles.uploadActions}>
        <button
          className={styles.primaryButton}
          disabled={pending || tooLarge}
          type="submit"
        >
          {pending ? "Reading your document…" : "Scan my document"}
        </button>
        <Link className={styles.quietLink} href="/profile">
          Cancel
        </Link>
      </div>

      {pending ? (
        <p className={styles.pendingNote} role="status">
          Reading the text of your document. This usually takes a few seconds.
        </p>
      ) : null}
    </form>
  );
}
