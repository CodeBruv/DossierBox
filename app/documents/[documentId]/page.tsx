import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth, authSessionConfiguration } from "@/auth/auth";
import { documentTypeLabel, getOwnedDocument } from "@/documents/repository";
import { Container } from "@/ui";
import styles from "@/styles/pages/documents.module.css";

type DocumentPageProps = {
  params: Promise<{ documentId: string }>;
};

export default async function DocumentPage({ params }: DocumentPageProps) {
  const { documentId } = await params;
  if (!authSessionConfiguration) redirect(`/auth/sign-in?callbackUrl=%2Fdocuments%2F${documentId}&error=Configuration`);
  const session = await auth();
  if (!session?.user?.id) redirect(`/auth/sign-in?callbackUrl=%2Fdocuments%2F${documentId}&error=SessionRequired`);

  const document = await getOwnedDocument(session.user.id, documentId);
  if (!document) notFound();

  return (
    <div className={styles.page}>
      <Container>
        <div className={styles.narrow}>
          <Link className={styles.backLink} href="/documents">Back to documents</Link>
          <header className={styles.editorHeader}>
            <p className={styles.eyebrow}>{documentTypeLabel(document.type)}</p>
            <h1>{document.title}</h1>
            <p>This draft was created successfully and is connected to your dossier.</p>
          </header>

          <section className={styles.editorPlaceholder} aria-labelledby="editor-status-title">
            <p className={styles.statusBadge}>{document.status === "draft" ? "Draft" : document.status}</p>
            <h2 id="editor-status-title">Document editor coming next</h2>
            <p>The document instance is saved. The full content editor and document-specific layout controls will be added in the document engine phase.</p>
            <p className={styles.documentMeta}>Last updated {document.updatedAt.toLocaleDateString()}</p>
          </section>
        </div>
      </Container>
    </div>
  );
}
