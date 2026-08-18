import { redirect } from "next/navigation";
import { auth, authSessionConfiguration } from "@/auth/auth";
import { listDocuments, documentTypeLabel } from "@/documents/repository";
import { Container } from "@/ui";
import styles from "@/styles/pages/documents.module.css";

export default async function DocumentsPage() {
  if (!authSessionConfiguration) redirect("/auth/sign-in?callbackUrl=%2Fdocuments&error=Configuration");
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/sign-in?callbackUrl=%2Fdocuments&error=SessionRequired");

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
              <a className={styles.primaryButton} href="/documents">Try again</a>
              <a className={styles.backLink} href="/home">Back to Home</a>
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
          <a className={styles.primaryButton} href="/documents/new">Create a document</a>
        </div>

        {documents.length ? (
          <div className={styles.documentList}>
            {documents.map((document) => (
              <article className={styles.documentRow} key={document.id}>
                <div>
                  <p className={styles.documentType}>{documentTypeLabel(document.type)}</p>
                  <h2>{document.title}</h2>
                  <p className={styles.documentMeta}>Draft · Created {document.createdAt.toLocaleDateString()}</p>
                </div>
                <a className={styles.secondaryButton} href={`/documents/${document.id}`}>Open</a>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <h2>Your document workspace is ready when you are.</h2>
            <p>Start with a purpose and create a draft connected to your dossier.</p>
            <a className={styles.primaryButton} href="/documents/new">Create a document</a>
          </div>
        )}
      </Container>
    </div>
  );
}
