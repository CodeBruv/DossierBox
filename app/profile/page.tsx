import Link from "next/link";
import { requireProfileUser } from "@/profile/authorization";
import { buildDossierFlow, dossierSections } from "@/profile/flow";
import { getDossierSectionState, getOrCreateProfile } from "@/profile/repository";
import { profileSectionMap } from "@/profile/sections";
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
  const [state, query] = await Promise.all([
    getDossierSectionState(profile.id),
    searchParams,
  ]);

  /*
   * Both halves of the section state, together. The registry gives the running
   * order; the counts make sure a section holding saved information is listed even
   * when it was never picked. Passing only the registry is what made this screen
   * report a populated dossier as empty.
   */
  const counts = state.counts;
  const flow = buildDossierFlow(state.registered, counts);
  const sections = dossierSections(flow);
  const status = query.status ? statusMessages[query.status] : undefined;
  const identityReady = Boolean(profile.displayName);

  /**
   * The hub is an overview, not a checkpoint the user must pass through between
   * sections. Its single primary action resumes wherever the dossier is thinnest
   * so returning users are never left deciding where to click.
   */
  const firstEmpty = sections.find((key) => counts[key] === 0);
  const resume = !identityReady
    ? { href: "/profile/basics", label: "Start with your identity" }
    : !sections.length
      ? { href: "/profile/sections", label: "Choose your sections" }
      : firstEmpty
        ? { href: `/profile/${firstEmpty}`, label: `Continue with ${profileSectionMap[firstEmpty].label}` }
        : { href: "/profile/review", label: "Review your dossier" };

  return (
    <div className={styles.page}>
      <Container>
        <header className={styles.pageHeader}>
          <div>
            <p className={styles.eyebrow}>Your dossier</p>
            <h1>Your professional source of truth</h1>
            <p className={styles.lead}>Build and maintain your reusable information here, then use it to create focused professional documents.</p>
          </div>
          <Link className={styles.primaryButton} href={resume.href}>
            {resume.label}
          </Link>
        </header>

        {status ? <p className={styles.successStatus} role="status">{status}</p> : null}

        <section className={styles.basicsBand} aria-labelledby="basics-title">
          <div>
            <h2 id="basics-title">Personal information and direction</h2>
            <p>{profile.headline || profile.careerDirection || profile.displayName || "Add the core information you want available across your career documents."}</p>
          </div>
          <Link className={styles.secondaryButton} href="/profile/basics">Edit identity and direction</Link>
        </section>

        <div className={styles.sectionHeading}>
          <div>
            <h2>Dossier sections</h2>
            <p>The sections you chose, plus any section that already holds information.</p>
          </div>
          {sections.length ? (
            <Link className={styles.secondaryButton} href="/profile/sections">Change sections</Link>
          ) : null}
        </div>

        {sections.length ? (
          <div className={styles.sectionList}>
            {sections.map((key) => {
              const definition = profileSectionMap[key];
              const count = counts[key];
              return (
                <Link className={styles.sectionRow} href={`/profile/${key}`} key={key}>
                  <span>
                    <strong>{definition.label}</strong>
                    <small>{definition.description}</small>
                  </span>
                  <span className={count ? styles.count : styles.countEmpty}>
                    {count ? `${count} ${count === 1 ? "entry" : "entries"}` : "Not started"}
                  </span>
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

        {sections.length ? (
          <div className={styles.flowFooter}>
            <div className={styles.flowFooterBack}>
              <Link className={styles.quietLink} href="/home">
                <span aria-hidden="true">← </span>Home
              </Link>
            </div>
            <div className={styles.flowFooterActions}>
              <Link className={styles.secondaryButton} href="/profile/review">
                Review dossier
              </Link>
            </div>
          </div>
        ) : null}
      </Container>
    </div>
  );
}
