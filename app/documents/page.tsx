import Link from "next/link";
import { redirect } from "next/navigation";
import { authSessionConfiguration } from "@/auth/auth";
import { getSession } from "@/auth/session";
import { resolveTemplate } from "@/documents/presentation";
import { listDocuments, documentTypeLabel } from "@/documents/repository";
import { Container } from "@/ui";
import styles from "@/styles/pages/documents.module.css";

type DocumentsPageProps = {
  searchParams: Promise<{ status?: string; error?: string }>;
};

/**
 * Outcomes of an action that finished somewhere else.
 *
 * Mapped from a fixed set rather than echoed from the query string, which is
 * attacker-controlled. "Unknown document" covers both a document that never existed and
 * one belonging to another account: the same answer for both is what keeps documents
 * non-enumerable, and it happens to be the true answer from this user's side.
 */
const noticeMessages: Record<string, string> = {
  deleted: "Document deleted. Your dossier is unchanged.",
};

const errorMessages: Record<string, string> = {
  "unknown-document": "That document is no longer here.",
};

export default async function DocumentsPage({ searchParams }: DocumentsPageProps) {
  if (!authSessionConfiguration) redirect("/auth/sign-in?callbackUrl=%2Fdocuments&error=Configuration");
  const session = await getSession();
  if (!session?.user?.id) redirect("/auth/sign-in?callbackUrl=%2Fdocuments&error=SessionRequired");

  const { status, error } = await searchParams;

  let documents;
  try {
    documents = await listDocuments(session.user.id);
  } catch (error) {
    console.error("[documents] Failed to load documents", error);
    return (
      <div className={styles.page}>
        <Container>
          <div className={styles.errorState} role="alert">
            <p className={styles.eyebrow}>Documents unavailable</p>
            <h1>We couldn't load your documents right now.</h1>
            <p>Please try again. Your saved dossier and documents have not been changed.</p>
            <div className={styles.errorActions}>
              {/* Deliberately a plain anchor: this one is meant to re-request the page. */}
              <a className={styles.primaryButton} href="/documents">Try again</a>
              <Link className={styles.backLink} href="/home">Back to Home</Link>
            </div>
          </div>
        </Container>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Container>
        <div className={styles.pageHeader}>
          <div>
            <p className={styles.eyebrow}>Derived work</p>
            <h1>Your documents</h1>
            <p className={styles.lead}>Documents are created from your dossier for a specific purpose. Your reusable information stays in the dossier.</p>
          </div>
          <Link className={styles.primaryButton} href="/documents/new">Create a document</Link>
        </div>

        {error ? (
          <p className={styles.errorStatus} role="alert">
            {errorMessages[error] ?? "That action didn't complete. Please try again."}
          </p>
        ) : null}
        {status && !error && noticeMessages[status] ? (
          <p className={styles.successStatus} role="status">{noticeMessages[status]}</p>
        ) : null}

        {documents.length ? (
          <div className={styles.documentList}>
            {documents.map((document) => (
              <article className={styles.documentRow} key={document.id}>
                <div>
                  <p className={styles.documentType}>{documentTypeLabel(document.type)}</p>
                  <h2>{document.title}</h2>
                  {/*
                    Updated, not created, because the list is ordered by
                    updatedAt — showing a different date than the one the order
                    is based on makes the ordering look arbitrary. The style is
                    named too: two documents of the same type can now differ
                    only by style, and this is where the user tells them apart.
                  */}
                  <p className={styles.documentMeta}>
                    {document.status === "draft" ? "Draft" : document.status} ·{" "}
                    {resolveTemplate(document.template, document.type).label} · Updated{" "}
                    {document.updatedAt.toLocaleDateString()}
                  </p>
                </div>
                <Link className={styles.secondaryButton} href={`/documents/${document.id}`}>Open</Link>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <h2>Your document workspace is ready when you are.</h2>
            <p>Start with a purpose and create a draft connected to your dossier.</p>
            <Link className={styles.primaryButton} href="/documents/new">Create a document</Link>
          </div>
        )}
      </Container>
    </div>
  );
}
