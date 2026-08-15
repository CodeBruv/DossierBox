import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteProfileEntryAction } from "@/profile/actions";
import { requireProfileUser } from "@/profile/authorization";
import { getOrCreateProfile, listSectionEntries } from "@/profile/repository";
import { isProfileSection, profileSectionMap } from "@/profile/sections";
import { Container } from "@/ui";
import styles from "@/styles/pages/profile.module.css";

type SectionPageProps = {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ status?: string }>;
};

const statusMessages: Record<string, string> = {
  created: "Entry saved.",
  updated: "Entry updated.",
  deleted: "Entry deleted.",
  "delete-failed": "The entry could not be deleted.",
};

export default async function ProfileSectionPage({ params, searchParams }: SectionPageProps) {
  const { section } = await params;
  if (!isProfileSection(section)) notFound();

  const user = await requireProfileUser();
  const profile = await getOrCreateProfile(user.id, user);
  const [entries, query] = await Promise.all([
    listSectionEntries(section, profile.id),
    searchParams,
  ]);
  const definition = profileSectionMap[section];
  const status = query.status ? statusMessages[query.status] : undefined;

  return (
    <div className={styles.page}>
      <Container>
        <div className={styles.narrow}>
          <Link className={styles.backLink} href="/profile">Back to profile</Link>
          <header className={styles.sectionPageHeader}>
            <div>
              <p className={styles.eyebrow}>Career profile</p>
              <h1>{definition.label}</h1>
              <p>{definition.description}</p>
            </div>
            <Link className={styles.primaryButton} href={`/profile/${section}/new`}>Add {definition.singular}</Link>
          </header>

          {status ? <p className={query.status === "delete-failed" ? styles.errorSummary : styles.successStatus} role="status">{status}</p> : null}

          {entries.length ? (
            <div className={styles.entryList}>
              {entries.map((entry) => {
                const record = entry as unknown as Record<string, unknown>;
                const deleteAction = deleteProfileEntryAction.bind(null, section, String(record.id));
                return (
                  <article className={styles.entryCard} key={String(record.id)}>
                    <div>
                      <h2>{entryTitle(section, record)}</h2>
                      <p>{entryDetail(record)}</p>
                    </div>
                    <div className={styles.entryActions}>
                      <Link className={styles.secondaryButton} href={`/profile/${section}/${record.id}/edit`}>Edit</Link>
                      <form action={deleteAction}>
                        <button className={styles.dangerButton} type="submit">Delete</button>
                      </form>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <h2>No entries yet</h2>
              <p>Add only factual information you want available for future use.</p>
              <Link className={styles.primaryButton} href={`/profile/${section}/new`}>Add {definition.singular}</Link>
            </div>
          )}
        </div>
      </Container>
    </div>
  );
}

function entryTitle(section: string, record: Record<string, unknown>) {
  const candidates = section === "experience"
    ? [record.role, record.organization]
    : [record.name, record.title, record.language, record.organization, record.institution, record.label];
  return candidates.find((value) => typeof value === "string" && value) as string || "Profile entry";
}

function entryDetail(record: Record<string, unknown>) {
  const detail = [record.organization, record.institution, record.issuer, record.publisher, record.role, record.type]
    .find((value) => typeof value === "string" && value);
  const years = [record.startYear ?? record.issueYear ?? record.year, record.endYear ?? record.expiryYear]
    .filter((value) => typeof value === "number")
    .join(" - ");
  return [detail, years].filter(Boolean).join(" · ") || "Saved career information";
}
