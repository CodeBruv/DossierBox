import Link from "next/link";
import { requireProfileUser } from "@/profile/authorization";
import {
  getEnabledSections,
  getOrCreateProfile,
  getSectionCounts,
} from "@/profile/repository";
import { profileSectionMap } from "@/profile/sections";
import type { ProfileSectionKey } from "@/profile/types";
import { Container } from "@/ui";
import styles from "@/styles/pages/profile.module.css";

type ProfilePageProps = {
  searchParams: Promise<{ status?: string }>;
};

const statusMessages: Record<string, string> = {
  "basics-saved": "Personal and career direction information saved.",
  "sections-saved": "Profile sections updated.",
};

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const user = await requireProfileUser();
  const profile = await getOrCreateProfile(user.id, user);
  const [enabledRows, counts, query] = await Promise.all([
    getEnabledSections(profile.id),
    getSectionCounts(profile.id),
    searchParams,
  ]);
  const enabled = enabledRows
    .map((row) => row.section)
    .filter((section): section is ProfileSectionKey => section in profileSectionMap);
  const status = query.status ? statusMessages[query.status] : undefined;

  return (
    <div className={styles.page}>
      <Container>
        <header className={styles.pageHeader}>
          <div>
            <p className={styles.eyebrow}>Your dossier</p>
            <h1>Your professional source of truth</h1>
            <p className={styles.lead}>Build and maintain your reusable information here, then use it to create focused professional documents.</p>
          </div>
          <Link className={styles.accountLink} href="/home">Back to Home</Link>
        </header>

        {status ? <p className={styles.successStatus} role="status">{status}</p> : null}

        <section className={styles.basicsBand} aria-labelledby="basics-title">
          <div>
            <h2 id="basics-title">Personal information and direction</h2>
            <p>{profile.headline || profile.careerDirection || profile.displayName || "Add the core information you want available across your career documents."}</p>
          </div>
          <Link className={styles.secondaryButton} href="/profile/basics">Edit basics</Link>
        </section>

        <div className={styles.sectionHeading}>
          <div>
            <h2>Dossier sections</h2>
            <p>Only selected sections appear here. Saved information remains intact when a section is hidden.</p>
          </div>
          <Link className={styles.secondaryButton} href="/profile/sections">Choose sections</Link>
        </div>

        {enabled.length ? (
          <div className={styles.sectionList}>
            {enabled.map((key) => {
              const definition = profileSectionMap[key];
              const count = counts[key];
              return (
                <Link className={styles.sectionRow} href={`/profile/${key}`} key={key}>
                  <span>
                    <strong>{definition.label}</strong>
                    <small>{definition.description}</small>
                  </span>
                  <span className={styles.count}>{count} {count === 1 ? "entry" : "entries"}</span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <h2>Add the sections that fit your career</h2>
            <p>Education, credentials, projects, memberships, and other sections are optional.</p>
            <Link className={styles.primaryButton} href="/profile/sections">Choose sections</Link>
          </div>
        )}
      </Container>
    </div>
  );
}
