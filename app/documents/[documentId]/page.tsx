import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  applicationObjectiveKindLabel,
  normalizeApplicationObjective,
} from "@/applications";
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
import { resolvePresentationStyle } from "@/documents/presentation";
import { readOwnedDocumentComposition } from "@/documents/read-composition";
import { documentTypeLabel, listOwnedDocumentVersions } from "@/documents/repository";
import { getDossierSnapshot } from "@/profile/repository";
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
  "delete-failed":
    "We couldn't delete this document right now. It is still here, and nothing else was changed.",
};

export default async function DocumentPage({ params, searchParams }: DocumentPageProps) {
  const { documentId } = await params;
  if (!authSessionConfiguration) redirect(`/auth/sign-in?callbackUrl=%2Fdocuments%2F${documentId}&error=Configuration`);
  const session = await getSession();
  if (!session?.user?.id) redirect(`/auth/sign-in?callbackUrl=%2Fdocuments%2F${documentId}&error=SessionRequired`);

  const { status, error, version: requestedVersionId } = await searchParams;

  let read;
  let snapshot;
  try {
    read = await readOwnedDocumentComposition(
      session.user.id,
      documentId,
      requestedVersionId,
    );
    /* The mutable Dossier is reachable only through the explicit legacy result. */
    if (read.kind === "legacy") snapshot = await getDossierSnapshot(session.user.id);
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
  const versionBacked = versionRead !== null;
  const presentationStyle = versionRead
    ? versionRead.presentationStyle
    : resolvePresentationStyle(document.template, document.type);
  const composed = versionRead
    ? versionRead.composed
    : snapshot
      ? composeDocument(document.type, snapshot, {
          hiddenSections: document.hiddenSections,
          sectionOrder: document.sectionOrder,
        })
      : null;
  const isEmpty = !composed || isComposedDocumentEmpty(composed);
  const objective = normalizeApplicationObjective(document.objective);
  const versions = await listOwnedDocumentVersions(session.user.id, document.id);
  const applicationContext = objective
    ? applicationObjectiveKindLabel(objective.kind)
    : "No specific application";

  /*
   * The arrangement control lists every section this dossier *could* show, which
   * is not the same as what the document currently shows — a hidden section has
   * to stay in the list or there would be no way to bring it back. Composed with
   * the document's order but no hiding, for exactly that reason: the user needs to
   * see a cleared section sitting in the place it will reappear in.
   */
  const offeredSections = !versionBacked && snapshot
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
              {versionRead
                ? `Composed from immutable accepted version ${versionRead.version}.`
                : "Composed from your dossier. Update your dossier and this document follows — your information lives in one place."}
            </p>
          </header>

          <p className={styles.editorMeta}>
            <span className={styles.statusBadge}>
              {versionRead ? "Accepted version" : "Live draft"}
            </span>{" "}
            {presentationStyle.label} · {versionRead ? "Accepted" : "Updated"} {(
              versionRead?.createdAt ?? document.updatedAt
            ).toLocaleDateString()}
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

        <section aria-labelledby="document-state-heading" className={styles.lifecyclePanel} data-print-skip>
          <div className={styles.lifecycleSummary}>
            <div>
              <p className={styles.lifecycleLabel}>Application context</p>
              <p>{applicationContext}</p>
            </div>
            <div>
              <p className={styles.lifecycleLabel}>Document state</p>
              <p>{versionRead ? `Immutable version ${versionRead.version}` : "Mutable · follows your Dossier"}</p>
            </div>
            <div>
              <p className={styles.lifecycleLabel}>Export readiness</p>
              <p>{versionRead ? "Ready for PDF export" : "Not ready · an accepted version is required"}</p>
            </div>
          </div>
          <div className={styles.lifecycleAction}>
            <p className={styles.eyebrow}>Next action</p>
            <h2 id="document-state-heading">
              {versionRead ? "Export this accepted version" : "Prepare this draft for generation"}
            </h2>
            <p>
              {versionRead
                ? "This preview is composed only from the accepted immutable artifact. Export uses this same saved version."
                : "Keep refining the live preview, or open the guided preparation path to select Evidence, approve a specification, generate, review, and accept an immutable version."}
            </p>
            {versionRead ? (
              <a
                className={styles.primaryButton}
                href={`/api/documents/${document.id}/export?version=${versionRead.documentVersionId}`}
              >
                Export PDF
              </a>
            ) : (
              <div>
                <Link className={styles.primaryButton} href={`/documents/${document.id}/prepare`}>
                  Prepare for generation
                </Link>
                <p className={styles.lifecycleNote}>
                  Preparation uses this draft's existing Application. The live draft stays mutable and cannot be exported; only acceptance creates an immutable, exportable version.
                </p>
              </div>
            )}
          </div>
          {versions.length > 1 ? (
            <nav aria-label="Accepted document versions" className={styles.versionHistory}>
              <p className={styles.lifecycleLabel}>Accepted versions</p>
              <ul>
                {versions.map((version) => (
                  <li key={version.id}>
                    <Link
                      aria-current={version.id === versionRead?.documentVersionId ? "page" : undefined}
                      href={`/documents/${document.id}?version=${version.id}`}
                    >
                      Version {version.version}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </section>

        {isEmpty ? (
          <div className={styles.narrow}>
            <div className={styles.emptyState}>
              <h2>{versionBacked ? "This accepted version has no visible content." : "There is nothing in your dossier to compose yet."}</h2>
              <p>
                {versionBacked
                  ? "The immutable content and configuration snapshot were composed without substituting current dossier data."
                  : "This document draws entirely on what you have recorded. Add your name, contact details and at least one section, and it will appear here."}
              </p>
              {!versionBacked ? <Link className={styles.primaryButton} href="/profile">Go to your dossier</Link> : null}
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
            {!versionBacked ? (
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
                  presentationStyle={presentationStyle.id}
                  title={document.title}
                />
              </aside>
            ) : null}

            <div className={styles.workspacePreview}>
              <DocumentPreview document={composed} presentationStyle={presentationStyle} />
            </div>
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
