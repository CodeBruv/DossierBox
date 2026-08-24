import Link from "next/link";
import { requireProfileUser } from "@/profile/authorization";
import { Container } from "@/ui";
import { ImportUploadForm } from "@/import/components/import-upload-form";
import { MAX_UPLOAD_BYTES } from "@/import/detect";
import { getPendingDocumentImport } from "@/import/repository";
import styles from "@/styles/pages/import.module.css";

type ImportPageProps = {
  searchParams: Promise<{ status?: string }>;
};

const statusMessages: Record<string, string> = {
  discarded: "That scan was discarded. Nothing was added to your dossier.",
};

/**
 * The start of an import: choose a document to read.
 *
 * If the user already has a reading they were part-way through checking, this offers to resume
 * it rather than silently discarding it — an abandoned import is a copy of somebody's career
 * document, and the honest thing is to say it is there.
 */
export default async function ImportPage({ searchParams }: ImportPageProps) {
  const user = await requireProfileUser();
  const [pending, query] = await Promise.all([
    getPendingDocumentImport(user.id),
    searchParams,
  ]);

  const status = query.status ? statusMessages[query.status] : undefined;

  return (
    <div className={styles.page}>
      <Container>
        <div className={styles.narrow}>
          <Link className={styles.backLink} href="/profile">
            Back to Dossier
          </Link>
          <header className={styles.editorHeader}>
            <p className={styles.eyebrow}>Import</p>
            <h1>Import an existing CV or résumé</h1>
            <p>
              Upload a document you already have and we will read it into your dossier. You will
              see everything we found and confirm it before anything is added — nothing goes in
              automatically.
            </p>
          </header>

          {status ? (
            <p className={styles.successStatus} role="status">
              {status}
            </p>
          ) : null}

          {pending ? (
            <div className={styles.resumeCard}>
              <div>
                <strong>You have a scan waiting</strong>
                <p>
                  You started importing <strong>{pending.filename}</strong> but did not finish
                  reviewing it.
                </p>
              </div>
              <Link className={styles.secondaryButton} href={`/profile/import/${pending.id}`}>
                Resume review
              </Link>
            </div>
          ) : null}

          <ImportUploadForm maxBytes={MAX_UPLOAD_BYTES} />

          <div className={styles.reassure}>
            <h2>What happens to your file</h2>
            <p>
              We read the text of your document to find your experience, education, skills, and
              other career information. The file itself is not stored — only the information you
              choose to keep is added to your dossier, and you can edit or remove any of it
              afterwards.
            </p>
          </div>
        </div>
      </Container>
    </div>
  );
}
