import Link from "next/link";
import { requireProfileUser } from "@/profile/authorization";
import { buildDossierFlow, dossierSections } from "@/profile/flow";
import { getDossierSectionState, getOrCreateProfile } from "@/profile/repository";
import { profileSectionMap } from "@/profile/sections";
import { Container } from "@/ui";
import styles from "@/styles/pages/profile.module.css";

type ReviewPageProps = {
  searchParams: Promise<{ status?: string }>;
};

const statusMessages: Record<string, string> = {
  created: "Entry saved.",
  updated: "Entry updated.",
  "basics-saved": "Identity saved.",
  "sections-saved": "Sections updated.",
};

/**
 * The end of the dossier flow.
 *
 * This is where building stops being a sequence and becomes a decision: keep
 * refining, or turn the dossier into a document. Creating a document is offered
 * here but never required — the dossier is useful on its own, so the page always
 * provides a way out that does not involve choosing a document type.
 */
export default async function DossierReviewPage({ searchParams }: ReviewPageProps) {
  const user = await requireProfileUser();
  const profile = await getOrCreateProfile(user.id, user);
  const [state, query] = await Promise.all([
    getDossierSectionState(profile.id),
    searchParams,
  ]);

  /*
   * The review screen is the one place a user checks that nothing they entered has
   * gone missing, so it must derive its list from what is saved and not only from
   * what was chosen. It read the chosen-section registry alone until an entry saved
   * outside that registry proved it could show a complete dossier as empty.
   */
  const counts = state.counts;
  const flow = buildDossierFlow(state.registered, counts);
  const sections = dossierSections(flow);
  const status = query.status ? statusMessages[query.status] : undefined;
  const filled = sections.filter((key) => counts[key] > 0);
  const identity = profile.displayName ?? user.name ?? null;

  return (
    <div className={styles.page}>
      <Container>
        <div className={styles.narrow}>
          <header className={styles.sectionPageHeader}>
            <div>
              <p className={styles.eyebrow}>Review</p>
              <h1>{identity ? `${identity}'s dossier` : "Your dossier"}</h1>
              <p>
                This is your reusable record. Everything below stays available for
                every document you create later.
              </p>
            </div>
          </header>

          {status ? <p className={styles.successStatus} role="status">{status}</p> : null}

          <section className={styles.basicsBand} aria-labelledby="review-identity">
            <div>
              <h2 id="review-identity">Identity and direction</h2>
              <p>
                {profile.headline
                  || profile.careerDirection
                  || "No headline or career direction saved yet."}
              </p>
            </div>
            <Link className={styles.secondaryButton} href="/profile/basics">Edit</Link>
          </section>

          <div className={styles.sectionHeading}>
            <div>
              <h2>Sections</h2>
              <p>
                {sections.length
                  ? `${filled.length} of ${sections.length} started. Empty sections are simply left out of documents.`
                  : "No sections selected yet."}
              </p>
            </div>
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
                      <small>
                        {count
                          ? `${count} ${count === 1 ? "entry" : "entries"} saved`
                          : "Nothing saved yet"}
                      </small>
                    </span>
                    <span className={count ? styles.count : styles.countEmpty}>
                      {count ? "Review" : "Add"}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <h2>Choose what your dossier should hold</h2>
              <p>Pick the sections that match your career. You can change them at any time.</p>
              <Link className={styles.primaryButton} href="/profile/sections">Choose sections</Link>
            </div>
          )}

          <section className={styles.handoff} aria-labelledby="review-next">
            <p className={styles.eyebrow}>Optional next step</p>
            <h2 id="review-next">Turn this into a document</h2>
            <p>
              Your dossier is saved and stays yours. When you want a CV or résumé
              from it, start here — you can also come back to this later.
            </p>
            <div className={styles.handoffActions}>
              <Link className={styles.primaryButton} href="/documents/new">
                Create a document
              </Link>
              <Link className={styles.secondaryButton} href="/profile">
                Keep building the dossier
              </Link>
              <Link className={styles.quietLink} href="/home">
                Skip for now
              </Link>
            </div>
          </section>
        </div>
      </Container>
    </div>
  );
}
