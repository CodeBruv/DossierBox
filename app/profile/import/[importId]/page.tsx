import { notFound } from "next/navigation";
import Link from "next/link";
import { requireProfileUser } from "@/profile/authorization";
import { Container } from "@/ui";
import { confirmDocumentImportAction } from "@/import/actions";
import { ImportReviewForm } from "@/import/components/import-review-form";
import { getOwnedDocumentImport } from "@/import/repository";
import { buildImportReview } from "@/import/review";
import type { ImportFormState } from "@/import/state";
import styles from "@/styles/pages/import.module.css";

type ImportReviewPageProps = {
  params: Promise<{ importId: string }>;
};

/**
 * Reviewing a scanned document before any of it is imported.
 *
 * The import is fetched scoped to the signed-in user inside the query itself, so a review URL
 * carrying someone else's import id returns nothing and this page is a 404 — the id in the URL
 * grants no access on its own. The confirm action is bound to that id here, on the server, so
 * the browser never chooses which import a submission commits.
 */
export default async function ImportReviewPage({ params }: ImportReviewPageProps) {
  const { importId } = await params;
  const user = await requireProfileUser();
  const stored = await getOwnedDocumentImport(user.id, importId);

  if (!stored) {
    notFound();
  }

  const review = buildImportReview(stored.result);

  /*
   * Bound to the import server-side. The action's signature is (importId, state, formData);
   * useActionState calls it with (state, formData), so the id is supplied here and cannot be
   * chosen by the client.
   */
  const action = confirmDocumentImportAction.bind(null, importId) as (
    state: ImportFormState,
    formData: FormData,
  ) => Promise<ImportFormState>;

  const nothingFound = review.basics.empty && review.totalRows === 0;

  return (
    <div className={styles.page}>
      <Container>
        <div className={styles.reviewLayout}>
          <Link className={styles.backLink} href="/profile/import">
            Back to import
          </Link>

          {nothingFound ? (
            <div className={styles.emptyReview}>
              <h1>We could not find career information in that document</h1>
              <p>
                We read <strong>{stored.filename}</strong> but did not recognise experience,
                education, or other career information in it. It may be a scan or an image rather
                than text. You can add your information directly instead.
              </p>
              <Link className={styles.primaryButton} href="/profile">
                Go to your dossier
              </Link>
            </div>
          ) : (
            <ImportReviewForm
              action={action}
              filename={stored.filename}
              importId={importId}
              review={review}
            />
          )}
        </div>
      </Container>
    </div>
  );
}
