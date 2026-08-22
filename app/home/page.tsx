import Link from "next/link";
import { redirect } from "next/navigation";
import { authSessionConfiguration } from "@/auth/auth";
import { getSession } from "@/auth/session";
import {
  getDossierFoundationReadiness,
  getEnabledSections,
  getOrCreateProfile,
} from "@/profile/repository";
import type { DossierReadiness, DossierReadinessState } from "@/profile/readiness";
import { profileSectionMap } from "@/profile/sections";
import type { ProfileSectionKey } from "@/profile/types";
import { Container } from "@/ui";
import styles from "@/styles/pages/home.module.css";

const foundationSections = ["experience", "education", "skills"] as const;

const readinessLabels: Record<DossierReadinessState, string> = {
  empty: "Not started",
  "in-progress": "In progress",
  ready: "Ready",
};

export default async function HomePage() {
  if (!authSessionConfiguration) {
    redirect("/auth/sign-in?callbackUrl=%2Fhome&error=Configuration");
  }

  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/auth/sign-in?callbackUrl=%2Fhome&error=SessionRequired");
  }

  const profile = await getOrCreateProfile(session.user.id, {
    name: session.user.name ?? null,
    email: session.user.email ?? null,
  });
  const [enabledRows, readiness] = await Promise.all([
    getEnabledSections(profile.id),
    getDossierFoundationReadiness(profile.id, {
      displayName: profile.displayName,
      headline: profile.headline,
      careerDirection: profile.careerDirection,
    }),
  ]);

  const enabled = enabledRows
    .map((row) => row.section)
    .filter((section): section is ProfileSectionKey => section in profileSectionMap);
  const trackedReadiness = [readiness.identity, ...foundationSections.map((section) => readiness[section])];
  const nextSection = trackedReadiness.some((item) => item.state !== "ready")
    ? !isReady(readiness.identity)
      ? { label: "Identity and direction", href: "/profile/basics", detail: readiness.identity.detail }
      : (() => {
          const section = foundationSections.find((key) => readiness[key].state !== "ready")!;
          return {
            label: profileSectionMap[section].label,
            href: `/profile/${section}`,
            detail: readiness[section].detail,
          };
        })()
    : { label: "Review your dossier", href: "/profile", detail: "Your foundation is ready to review." };

  return (
    <div className={styles.page}>
      <Container>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Your workspace</p>
            <h1>Welcome back{session.user.name ? `, ${session.user.name.split(" ")[0]}` : ""}.</h1>
            <p className={styles.lead}>
              Build one reliable dossier, then use it to create the documents you need.
            </p>
          </div>
          <Link className={styles.secondaryButton} href="/documents">
            View documents
          </Link>
        </header>

        <section className={styles.progressCard} aria-labelledby="progress-title">
          <div className={styles.progressHeader}>
            <div>
              <p className={styles.eyebrow}>Dossier readiness</p>
              <h2 id="progress-title">Build a reliable professional record</h2>
              <p className={styles.readinessIntro}>Each section becomes ready when it contains enough meaningful information to reuse in a document.</p>
            </div>
          </div>
          <div className={styles.sectionList}>
            <StatusRow label="Identity and direction" readiness={readiness.identity} href="/profile/basics" />
            {foundationSections.map((section) => (
              <StatusRow
                key={section}
                label={profileSectionMap[section].label}
                readiness={readiness[section]}
                href={`/profile/${section}`}
              />
            ))}
          </div>
          <p className={styles.nextAction}>{nextSection.detail}</p>
          <Link className={styles.primaryButton} href={nextSection.href}>
            {nextSection.label === "Review your dossier" ? nextSection.label : `Continue with ${nextSection.label.toLowerCase()}`}
          </Link>
        </section>

        <div className={styles.actionGrid}>
          <section className={styles.actionCard} aria-labelledby="dossier-action-title">
            <p className={styles.eyebrow}>Source of truth</p>
            <h2 id="dossier-action-title">Your dossier</h2>
            <p>Maintain the facts, experience, skills, and evidence you want to reuse across future documents.</p>
            <Link className={styles.textLink} href="/profile">Open dossier <span aria-hidden="true">→</span></Link>
          </section>
          <section className={styles.actionCard} aria-labelledby="document-action-title">
            <p className={styles.eyebrow}>Derived work</p>
            <h2 id="document-action-title">Create a document</h2>
            <p>Choose a purpose and turn the information in your dossier into a focused professional document.</p>
            <Link className={styles.textLink} href="/documents/new">Start a document <span aria-hidden="true">→</span></Link>
          </section>
        </div>

        {enabled.length > 0 ? (
          <p className={styles.note}>{enabled.length} dossier sections are available in your workspace.</p>
        ) : null}
      </Container>
    </div>
  );
}

function StatusRow({ label, readiness, href }: { label: string; readiness: DossierReadiness; href: string }) {
  const ready = isReady(readiness);

  return (
    <Link className={styles.statusRow} href={href}>
      <span className={ready ? styles.statusIconComplete : styles.statusIcon} aria-hidden="true">{ready ? "✓" : "→"}</span>
      <span>
        <span className={styles.statusLabel}>{label}</span>
        <span className={styles.statusDetail}>{readiness.detail}</span>
      </span>
      <span className={styles.statusText}>{readinessLabels[readiness.state]}</span>
    </Link>
  );
}

function isReady(readiness: DossierReadiness) {
  return readiness.state === "ready";
}
