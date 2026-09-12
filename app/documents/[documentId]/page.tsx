import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { authSessionConfiguration } from "@/auth/auth";
import { getSession } from "@/auth/session";
import { isComposedDocumentEmpty } from "@/documents/composition";
import { DocumentPreview } from "@/documents/components/document-preview";
import { DocumentWorkspace } from "@/documents/components/document-workspace";
import { updateDocumentAction } from "@/documents/actions";
import { DeleteDocument } from "@/documents/components/delete-document";
import { resolvePresentationStyle } from "@/documents/presentation";
import { readOwnedCurrentDraftComposition, readOwnedDocumentComposition } from "@/documents/read-composition";
import { documentTypeLabel, listOwnedDocumentVersions } from "@/documents/repository";
import { Container } from "@/ui";
import styles from "@/styles/pages/documents.module.css";

type DocumentPageProps = {
  params: Promise<{ documentId: string }>;
  searchParams: Promise<{ status?: string; error?: string; version?: string }>;
};

/**
 * What went wrong, in the user's terms.
 *
 * Mapped from a fixed set rather than echoed from the query string: the value is
 * attacker-controlled, and rendering it would make this page a place to inject
 * arbitrary text into a signed-in user's screen. Every message also says what
 * happened to their work, because "something went wrong" next to a form the user
 * just filled in reads as "you have lost it".
 */
const errorMessages: Record<string, string> = {
  "save-failed":
    "We couldn't save your changes right now. Nothing was altered — please try again.",
  "title-required": "A document needs a name. Your other changes were not saved.",
  "unknown-template": "That style isn't available. Your changes were not saved.",
  "invalid-content-overrides": "Those document edits are not supported. Your changes were not saved.",
  "delete-confirmation-required":
    "Confirm the deletion before continuing. The document is still here and nothing was changed.",
  "delete-failed":
     "We couldn't delete this document right now. It is still here, and nothing else was changed.",
  "preparation-required": "This document needs a little more setup before it can be prepared. Your working document is safe.",
  "generation-failed": "We couldn't prepare this version yet. Your working document is still safe. Try again.",
  "accept-failed": "We couldn't accept this version yet. Your working document is still safe.",
};

export default async function DocumentPage({ params, searchParams }: DocumentPageProps) {
  const { documentId } = await params;
  if (!authSessionConfiguration) redirect(`/auth/sign-in?callbackUrl=%2Fdocuments%2F${documentId}&error=Configuration`);
  const session = await getSession();
  if (!session?.user?.id) redirect(`/auth/sign-in?callbackUrl=%2Fdocuments%2F${documentId}&error=SessionRequired`);

  const { status, error, version: requestedVersionId } = await searchParams;

  let read;
  try {
    read = requestedVersionId
      ? await readOwnedDocumentComposition(session.user.id, documentId, requestedVersionId)
      : await readOwnedCurrentDraftComposition(session.user.id, documentId);
  } catch (loadError) {
    console.error(`[documents] Failed to load document ${documentId}`, loadError);
    return (
      <div className={styles.page}>
        <Container>
          <div className={styles.errorState} role="alert">
            <p className={styles.eyebrow}>Document unavailable</p>
            <h1>We couldn't load this document right now.</h1>
            <p>Please try again. The saved draft and your dossier have not been changed.</p>
            <div className={styles.errorActions}>
              {/* Deliberately a plain anchor: this one is meant to re-request the page. */}
              <a className={styles.primaryButton} href={`/documents/${documentId}`}>Try again</a>
              <Link className={styles.backLink} href="/documents">Back to Documents</Link>
            </div>
          </div>
        </Container>
      </div>
    );
  }
  if (read.kind === "not_found" || (read.kind === "invalid_version" && read.reason === "version_not_found")) notFound();
  if (read.kind === "invalid_version") {
    return (
      <div className={styles.page}>
        <Container>
          <div className={styles.errorState} role="alert">
            <p className={styles.eyebrow}>Version unavailable</p>
            <h1>This saved version cannot be composed safely.</h1>
            <p>Its immutable snapshot is incomplete or inconsistent. No live dossier data was substituted.</p>
            <Link className={styles.backLink} href="/documents">Back to Documents</Link>
          </div>
        </Container>
      </div>
    );
  }

  const document = read.document;
  const versionRead = read.kind === "version" ? read : null;
  const draftRead = read.kind === "draft" ? read : null;
  const incompleteRead = read.kind === "incomplete" ? read : null;
  const versionBacked = versionRead !== null;
  const presentationStyle = versionRead?.presentationStyle ?? draftRead?.presentationStyle ?? resolvePresentationStyle(document.template, document.type);
  const composed = versionRead?.composed ?? draftRead?.composed ?? null;
  // A valid zero-Requirement draft remains in the Workspace and uses its
  // application-scoped Evidence projections as the bounded baseline.
  const isEmpty = !composed || (isComposedDocumentEmpty(composed) && !draftRead);
  const versions = await listOwnedDocumentVersions(session.user.id, document.id);

  return (
    <div className={styles.page}>
      <Container>
        {/*
          `data-print-skip` is the hook print.css already uses to strip application furniture.
        */}
        <div className={styles.narrow} data-print-skip>
          <header className={styles.editorHeader}>
            <p className={styles.eyebrow}>{documentTypeLabel(document.type)}</p>
            <h1>{document.title}</h1>
          </header>

          {error ? (
            <p className={styles.errorStatus} role="alert">
              {errorMessages[error] ?? "We couldn't save your changes. Please try again."}
            </p>
          ) : null}
          {status === "saved" && !error ? (
            <p className={styles.successStatus} role="status">
              Changes saved.
            </p>
          ) : null}
          {status === "specification-approved" && !error ? (
            <p className={styles.successStatus} role="status">
              Your document is ready. Customize it below.
            </p>
          ) : null}
        </div>

        {versionRead ? (
          <div className={styles.narrow} data-print-skip>
            <a className={styles.primaryButton} href={`/api/documents/${document.id}/export?version=${versionRead.documentVersionId}`}>Export PDF</a>
            {versions.length > 1 ? (
              <nav aria-label="Accepted document versions" className={styles.versionHistory}>
                <p className={styles.lifecycleLabel}>Accepted versions</p>
                <ul>
                  {versions.map((version) => (
                    <li key={version.id}><Link aria-current={version.id === versionRead.documentVersionId ? "page" : undefined} href={`/documents/${document.id}?version=${version.id}`}>Version {version.version}</Link></li>
                  ))}
                </ul>
              </nav>
            ) : null}
          </div>
        ) : null}

        {isEmpty ? (
          <div className={styles.narrow}>
            <div className={styles.emptyState}>
              <h2>{versionBacked ? "This accepted version has no visible content." : "This document is not ready to display yet."}</h2>
              <p>
                {versionBacked
                  ? "The immutable content and configuration snapshot were composed without substituting current dossier data."
                  : "This document is still being prepared. Return shortly to continue customizing it."}
              </p>
              {incompleteRead ? <Link className={styles.primaryButton} href="/documents">Back to documents</Link> : null}
            </div>
          </div>
        ) : draftRead ? (
          <>
            <DocumentWorkspace
              documentId={document.id}
              documentType={document.type}
              hiddenSections={document.hiddenSections}
              pageBreaks={document.pageBreaks}
              contentOverrides={document.contentOverrides}
              presentationStyle={presentationStyle.id}
              saveAction={updateDocumentAction}
              sectionOrder={document.sectionOrder}
              selectedEvidence={draftRead.selectedEvidence}
              snapshot={draftRead.snapshot}
              title={document.title}
            />
            <div className={styles.narrow} data-print-skip>
              <a className={styles.primaryButton} href={`/api/documents/${document.id}/export`}>Export PDF</a>
            </div>
          </>
        ) : (
          <div className={styles.workspacePreview}>
            <DocumentPreview document={composed!} presentationStyle={presentationStyle} />
          </div>
        )}

        {/*
          Outside both branches above, and therefore always reachable. A draft created
          before the dossier had anything in it renders the empty state — which has no
          settings panel — so a delete control living beside the settings would be
          exactly unavailable for the drafts a user is most likely to want rid of.
        */}
        {!versionBacked ? (
          <div className={styles.narrow} data-print-skip>
            <DeleteDocument documentId={document.id} title={document.title} />
          </div>
        ) : null}
      </Container>
    </div>
  );
}
