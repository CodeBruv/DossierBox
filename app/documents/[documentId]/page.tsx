import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { authSessionConfiguration } from "@/auth/auth";
import { getSession } from "@/auth/session";
import {
  composableSections,
  composeDocument,
  isComposedDocumentEmpty,
} from "@/documents/composition";
import { DocumentPreview } from "@/documents/components/document-preview";
import { DocumentSettings } from "@/documents/components/document-settings";
import { DeleteDocument } from "@/documents/components/delete-document";
import { resolveTemplate } from "@/documents/presentation";
import { documentTypeLabel, getOwnedDocument } from "@/documents/repository";
import { getDossierSnapshot } from "@/profile/repository";
import { Container } from "@/ui";
import styles from "@/styles/pages/documents.module.css";

type DocumentPageProps = {
  params: Promise<{ documentId: string }>;
  searchParams: Promise<{ status?: string; error?: string }>;
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
  "delete-failed":
    "We couldn't delete this document right now. It is still here, and nothing else was changed.",
};

export default async function DocumentPage({ params, searchParams }: DocumentPageProps) {
  const { documentId } = await params;
  if (!authSessionConfiguration) redirect(`/auth/sign-in?callbackUrl=%2Fdocuments%2F${documentId}&error=Configuration`);
  const session = await getSession();
  if (!session?.user?.id) redirect(`/auth/sign-in?callbackUrl=%2Fdocuments%2F${documentId}&error=SessionRequired`);

  const { status, error } = await searchParams;

  let document;
  let snapshot;
  try {
    document = await getOwnedDocument(session.user.id, documentId);
    /*
     * The dossier is only read once the document is known to exist and to belong
     * to this session, so an unauthorised id never causes a career-history read.
     * That ordering is the point; the second round trip is the price of it.
     */
    if (document) {
      snapshot = await getDossierSnapshot(session.user.id);
    }
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
  if (!document) notFound();

  const template = resolveTemplate(document.template, document.type);

  /*
   * The document is composed on every render rather than stored. That is the
   * point of the architecture: the dossier is the source of truth, so a change
   * the user makes to their experience is reflected here immediately and the
   * same career fact is never held in two places to drift apart. Saved,
   * reproducible versions are a separate concern from this live view.
   */
  const composed = snapshot
    ? composeDocument(document.type, snapshot, {
        hiddenSections: document.hiddenSections,
        sectionOrder: document.sectionOrder,
      })
    : null;
  const isEmpty = !composed || isComposedDocumentEmpty(composed);

  /*
   * The arrangement control lists every section this dossier *could* show, which
   * is not the same as what the document currently shows — a hidden section has
   * to stay in the list or there would be no way to bring it back. Composed with
   * the document's order but no hiding, for exactly that reason: the user needs to
   * see a cleared section sitting in the place it will reappear in.
   */
  const offeredSections = snapshot
    ? composableSections(document.type, snapshot, document.sectionOrder)
    : [];

  return (
    <div className={styles.page}>
      <Container>
        {/*
          `data-print-skip` is the hook print.css already uses to strip
          application furniture. Printing this page should yield the document and
          nothing else — the title, the status and the controls are ours, not part
          of the user's document.
        */}
        <div className={styles.narrow} data-print-skip>
          <Link className={styles.backLink} href="/documents">Back to documents</Link>
          <header className={styles.editorHeader}>
            <p className={styles.eyebrow}>{documentTypeLabel(document.type)}</p>
            <h1>{document.title}</h1>
            <p>
              Composed from your dossier. Update your dossier and this document follows —
              your information lives in one place.
            </p>
          </header>

          <p className={styles.editorMeta}>
            <span className={styles.statusBadge}>
              {document.status === "draft" ? "Draft" : document.status}
            </span>{" "}
            {template.label} · Updated {document.updatedAt.toLocaleDateString()}
          </p>

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
        </div>

        {isEmpty ? (
          <div className={styles.narrow}>
            <div className={styles.emptyState}>
              <h2>There is nothing in your dossier to compose yet.</h2>
              <p>
                This document draws entirely on what you have recorded. Add your name, contact
                details and at least one section, and it will appear here.
              </p>
              <Link className={styles.primaryButton} href="/profile">Go to your dossier</Link>
            </div>
          </div>
        ) : (
          /*
           * Controls beside the sheet on a wide screen, above it on a narrow one.
           * The sheet is second in the DOM so that on a phone the settings — the
           * only things on this page that can be operated — come first, rather
           * than sitting below a document that is several screens tall.
           */
          <div className={styles.workspace}>
            <aside
              aria-label="Document settings"
              className={styles.workspaceControls}
              data-print-skip
            >
              <DocumentSettings
                documentId={document.id}
                documentType={document.type}
                hiddenSections={document.hiddenSections}
                sections={offeredSections}
                template={template.id}
                title={document.title}
              />
            </aside>

            <div className={styles.workspacePreview}>
              <DocumentPreview document={composed} template={template} />
            </div>
          </div>
        )}

        {/*
          Outside both branches above, and therefore always reachable. A draft created
          before the dossier had anything in it renders the empty state — which has no
          settings panel — so a delete control living beside the settings would be
          exactly unavailable for the drafts a user is most likely to want rid of.
        */}
        <div className={styles.narrow} data-print-skip>
          <DeleteDocument documentId={document.id} title={document.title} />
        </div>
      </Container>
    </div>
  );
}
