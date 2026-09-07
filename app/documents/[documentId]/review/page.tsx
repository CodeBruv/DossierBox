import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { authSessionConfiguration } from "@/auth/auth";
import { getSession } from "@/auth/session";
import { acceptGeneratedContentAction, generateDocumentAction } from "@/documents/actions";
import { getDocumentPreparation } from "@/documents/preparation";
import { compileStructuredDocumentContent } from "@/documents/content-compiler";
import { composeStructuredDocument } from "@/documents/composition";
import { documentTypeLabel } from "@/documents/repository";
import { resolvePresentationStyle } from "@/documents/presentation";
import { DocumentPreview } from "@/documents/components/document-preview";
import { Container } from "@/ui";
import styles from "@/styles/pages/documents.module.css";

type Props = {
  params: Promise<{ documentId: string }>;
  searchParams: Promise<{ status?: string; error?: string }>;
};

const errors: Record<string, string> = {
  "preparation-required": "This document needs a little more setup before it can be prepared. Your working document is safe.",
  "generation-failed": "We couldn't prepare this version yet. Your working document is still safe. Try again.",
  "accept-failed": "We couldn't accept this version yet. Your working document is still safe.",
};

export default async function DocumentReviewPage({ params, searchParams }: Props) {
  const { documentId } = await params;
  if (!authSessionConfiguration) redirect(`/auth/sign-in?callbackUrl=%2Fdocuments%2F${documentId}%2Freview&error=Configuration`);
  const session = await getSession();
  if (!session?.user?.id) redirect(`/auth/sign-in?callbackUrl=%2Fdocuments%2F${documentId}%2Freview&error=SessionRequired`);

  const preparation = await getDocumentPreparation(session.user.id, documentId);
  if (!preparation) notFound();
  const query = await searchParams;
  const specification = preparation.specification;
  const artifact = preparation.generation?.artifact ?? null;
  const compiled = artifact && specification ? compileStructuredDocumentContent({
    documentType: preparation.document.type,
    specification: {
      documentType: preparation.document.type,
      purpose: specification.purpose,
      constraints: specification.constraints,
      instructions: specification.instructions,
      context: specification.context,
      sectionExpectations: specification.sectionExpectations,
      outputCharacteristics: specification.outputCharacteristics,
    },
    selectedEvidence: preparation.evidence.map((item) => ({ evidenceId: item.id, sourceType: item.sourceType, sourceRecordId: item.sourceRecordId })),
    content: artifact.content,
    provenance: artifact.provenance as Record<string, { evidenceIds?: readonly string[]; requirementIds?: readonly string[] }>,
  }) : null;
  const review = compiled?.ok && specification ? composeStructuredDocument({
    documentType: preparation.document.type,
    specification: { documentType: preparation.document.type, purpose: specification.purpose },
    selectedEvidence: preparation.evidence.map((item) => ({ evidenceId: item.id, sourceType: item.sourceType, sourceRecordId: item.sourceRecordId })),
    content: compiled.content,
    configuration: { hiddenSections: preparation.document.hiddenSections, sectionOrder: preparation.document.sectionOrder },
  }) : null;
  const style = resolvePresentationStyle(preparation.document.template, preparation.document.type);

  return (
    <div className={styles.page}>
      <Container>
        <div className={styles.narrow}>
          <Link className={styles.backLink} href={`/documents/${documentId}`}>Back to customize</Link>
          <header className={styles.editorHeader}>
            <p className={styles.eyebrow}>{documentTypeLabel(preparation.document.type)} · Review</p>
            <h1>Review your final version</h1>
            <p>This is the version that will be exported. Check the document itself, then accept it to make it immutable.</p>
          </header>
          {query.error ? <p className={styles.errorStatus} role="alert">{errors[query.error] ?? errors["generation-failed"]}</p> : null}
          {query.status === "generated" ? <p className={styles.successStatus} role="status">Your version is ready to review.</p> : null}
        </div>

        <section aria-labelledby="review-document-heading" className={styles.reviewPanel}>
          <div className={styles.reviewHeader}>
            <div><p className={styles.eyebrow}>Ready to accept</p><h2 id="review-document-heading">{preparation.document.title}</h2></div>
            <span className={styles.statusBadge}>{style.label}</span>
          </div>
          {review ? <div className={styles.generatedPreview}><DocumentPreview document={review} presentationStyle={style} /></div> : (
            <div className={styles.emptyState}>
              <h2>{preparation.generation?.attempt.status === "failed" ? "We couldn't prepare this version" : "No generated version yet"}</h2>
              <p>{preparation.generation?.attempt.status === "failed" ? "Your working document is still safe. You can try preparing it again." : "Save your customization first, then prepare a version for review."}</p>
              {specification?.status === "approved" ? <form action={generateDocumentAction}><input name="documentId" type="hidden" value={documentId} /><button className={styles.primaryButton} type="submit">Prepare final version</button></form> : <Link className={styles.primaryButton} href={`/documents/${documentId}/prepare`}>Continue setup</Link>}
            </div>
          )}
          {review && artifact ? <div className={styles.reviewActions}>
            <Link className={styles.backLink} href={`/documents/${documentId}`}>Return to customize</Link>
            <form action={acceptGeneratedContentAction}><input name="generatedContentVersionId" type="hidden" value={artifact.id} /><button className={styles.primaryButton} type="submit">Accept version</button></form>
          </div> : null}
        </section>
      </Container>
    </div>
  );
}
