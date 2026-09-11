import Link from "next/link";
import { redirect } from "next/navigation";
import { authSessionConfiguration } from "@/auth/auth";
import { getSession } from "@/auth/session";
import { listOwnedHistory } from "@/applications/repository";
import { documentTypeLabel } from "@/documents/repository";
import { composeAcceptedVersionThumbnail } from "@/documents/read-composition";
import { DocumentMiniature } from "@/documents/components/document-miniature";
import { resolvePresentationStyle } from "@/documents/presentation";
import { Container } from "@/ui";
import styles from "@/styles/pages/documents.module.css";

type HistoryGroup = {
  key: string;
  label: string;
  detail: string | null;
  documents: Awaited<ReturnType<typeof listOwnedHistory>>;
};

function applicationLabel(item: Awaited<ReturnType<typeof listOwnedHistory>>[number]) {
  const intent = item.intent;
  if (!intent) return "Application context";
  return [intent.targetRole, intent.organisation, intent.institution, intent.programme]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" · ") || "Application context";
}

function groupHistory(items: Awaited<ReturnType<typeof listOwnedHistory>>): HistoryGroup[] {
  const groups = new Map<string, HistoryGroup>();
  for (const item of items) {
    const key = item.application?.id ?? "standalone";
    const existing = groups.get(key);
    if (existing) {
      existing.documents.push(item);
      continue;
    }
    groups.set(key, {
      key,
      label: item.application ? applicationLabel(item) : "Documents without application context",
      detail: item.application ? `Application created ${item.application.createdAt.toLocaleDateString()}` : "Reusable work kept outside an application",
      documents: [item],
    });
  }
  return [...groups.values()];
}

export default async function HistoryPage() {
  if (!authSessionConfiguration) redirect("/auth/sign-in?callbackUrl=%2Fhistory&error=Configuration");
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) redirect("/auth/sign-in?callbackUrl=%2Fhistory&error=SessionRequired");

  let history;
  try {
    history = await listOwnedHistory(userId);
  } catch (error) {
    console.error("[history] Failed to load owned history", error);
    return (
      <div className={styles.page}>
        <Container>
          <div className={styles.errorState} role="alert">
            <p className={styles.eyebrow}>History unavailable</p>
            <h1>We couldn't load your history right now.</h1>
            <p>Please try again. Your saved applications and documents have not been changed.</p>
            <a className={styles.primaryButton} href="/history">Try again</a>
          </div>
        </Container>
      </div>
    );
  }

  const groups = groupHistory(history);

  return (
    <div className={styles.page}>
      <Container>
        <div className={styles.pageHeader}>
          <div>
            <p className={styles.eyebrow}>Application vault</p>
            <h1>History</h1>
            <p className={styles.lead}>Return to documents you have created, continue a draft, or open an accepted version without changing your Dossier.</p>
          </div>
          <div className={styles.actionGroup}>
            <Link className={styles.primaryButton} href="/applications/new">Create application</Link>
            <Link className={styles.secondaryButton} href="/documents/new">Create document</Link>
          </div>
        </div>

        {groups.length ? (
          <div className={styles.historyGroups}>
            {groups.map((group) => (
              <section className={styles.historyGroup} key={group.key} aria-labelledby={`history-${group.key}`}>
                <header className={styles.historyGroupHeader}>
                  <div>
                    <p className={styles.eyebrow}>Application</p>
                    <h2 id={`history-${group.key}`}>{group.label}</h2>
                  </div>
                  {group.detail ? <p className={styles.documentMeta}>{group.detail}</p> : null}
                </header>
                <div className={styles.documentGrid}>
                  {group.documents.map((item) => {
                    const latestVersion = item.versions[0];
                    const acceptedThumbnail = latestVersion
                      ? composeAcceptedVersionThumbnail(item.document.type, latestVersion)
                      : null;
                    const presentationStyle = acceptedThumbnail?.presentationStyle ?? resolvePresentationStyle(item.document.template, item.document.type);
                    return (
                      <article className={styles.documentCard} key={item.document.id}>
                        <div className={styles.documentCardPreview}>
                          {acceptedThumbnail ? (
                            <DocumentMiniature document={acceptedThumbnail.composed} presentationStyle={presentationStyle} />
                          ) : (
                            <div className={styles.historyThumbnail}>
                              <span>{documentTypeLabel(item.document.type)}</span>
                              <strong>{item.document.title}</strong>
                              <small>Working draft</small>
                            </div>
                          )}
                        </div>
                        <div className={styles.documentCardBody}>
                          <p className={styles.documentType}>{documentTypeLabel(item.document.type)}</p>
                          <h3><Link href={`/documents/${item.document.id}`}>{item.document.title}</Link></h3>
                          <p className={styles.documentMeta}>{latestVersion ? `Accepted ${latestVersion.createdAt.toLocaleDateString()}` : `Updated ${item.document.updatedAt.toLocaleDateString()}`}</p>
                          <div className={styles.actionGroup}>
                            <Link className={styles.secondaryButton} href={`/documents/${item.document.id}`}>{latestVersion ? "Open document" : "Continue draft"}</Link>
                            {latestVersion ? <Link className={styles.backLink} href={`/documents/${item.document.id}?version=${latestVersion.id}`}>View accepted version</Link> : null}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <h2>Your application history is empty.</h2>
            <p>Documents and accepted versions will appear here as you create work. Your Dossier remains the place for reusable information.</p>
            <div className={styles.actionGroup}>
              <Link className={styles.primaryButton} href="/applications/new">Create application</Link>
              <Link className={styles.secondaryButton} href="/documents/new">Create document</Link>
            </div>
          </div>
        )}
      </Container>
    </div>
  );
}
