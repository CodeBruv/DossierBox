import Link from "next/link";
import { redirect } from "next/navigation";
import { authSessionConfiguration, sessionMaxAgeDays } from "@/auth/auth";
import { getSession } from "@/auth/session";
import { signOutAction } from "@/auth/actions";
import { routes } from "@/config/paths";
import { Container, ThemeSelector } from "@/ui";
import styles from "@/styles/pages/account.module.css";

/**
 * Initials for the identity block. Prefers the display name, falls back to the
 * email local part, and never renders an empty circle.
 */
function initialsFor(name: string | null | undefined, email: string | null | undefined) {
  const source = name?.trim() || email?.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "";
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
  const initials = parts.map((part) => part[0]).join("");
  return initials ? initials.toUpperCase() : "·";
}

export default async function AccountPage() {
  if (!authSessionConfiguration) {
    redirect("/auth/sign-in?callbackUrl=%2Faccount&error=Configuration");
  }

  const session = await getSession();

  if (!session?.user) {
    redirect("/auth/sign-in?callbackUrl=%2Faccount&error=SessionRequired");
  }

  const { name, email } = session.user;

  return (
    <div className={styles.page}>
      <Container>
        <div className={styles.layout}>
          <header className={styles.header}>
            <p className={styles.eyebrow}>Account</p>
            <h1 className={styles.title}>Account</h1>
          </header>

          {/*
            Identity first. The old page opened with a two-row definition list
            under the heading "Account information", which read like a database
            dump; who you are signed in as is the one thing this page must make
            immediately obvious.
          */}
          <section aria-labelledby="account-identity" className={styles.identity}>
            <h2 className={styles.visuallyHidden} id="account-identity">Signed in as</h2>
            <span aria-hidden="true" className={styles.avatar}>{initialsFor(name, email)}</span>
            <span className={styles.identityText}>
              <strong className={styles.identityName}>{name?.trim() || "Name not provided"}</strong>
              <span className={styles.identityEmail}>{email ?? "Email not provided"}</span>
            </span>
          </section>

          <section aria-labelledby="account-signin" className={styles.panel}>
            <h2 className={styles.panelTitle} id="account-signin">Sign-in method</h2>
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowLabel}>Provider</span>
                <span className={styles.rowValue}>Google</span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>Password</span>
                {/* Factual: no credentials provider is configured, so there is
                    nothing here to change and nothing to promise. */}
                <span className={styles.rowValue}>None stored by DossierBox</span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>Name and email</span>
                <span className={styles.rowValue}>Provided by your Google account</span>
              </div>
            </div>
            <p className={styles.panelNote}>
              Your name and email come from Google each time you sign in. To change them, or to review
              which apps can access your Google account, use your{" "}
              <a
                className={styles.inlineLink}
                href="https://myaccount.google.com/security"
                rel="noreferrer noopener"
                target="_blank"
              >
                Google account security settings
              </a>
              .
            </p>
          </section>

          <section aria-labelledby="account-information" className={styles.panel}>
            <h2 className={styles.panelTitle} id="account-information">Your information</h2>
            <p className={styles.panelNote}>
              Your Dossier holds your career information and is the source of truth for every document
              you generate. Editing it never rewrites a document you have already created.
            </p>
            <div className={styles.panelLinks}>
              <Link className={styles.panelLink} href={routes.profile}>
                <strong>Dossier</strong>
                <span>Identity, experience, education, skills and everything else you have recorded</span>
              </Link>
              <Link className={styles.panelLink} href={routes.documents}>
                <strong>Documents</strong>
                <span>Documents you have created, and their versions</span>
              </Link>
            </div>
          </section>

          {/*
            Appearance stays available here, but the header carries the theme
            control at all times — this is the same setting, not a second one.
          */}
          <section aria-labelledby="account-appearance" className={styles.panel}>
            <h2 className={styles.panelTitle} id="account-appearance">Appearance</h2>
            <p className={styles.panelNote}>
              Stored on this device only. The same control sits in the header on every page.
            </p>
            <ThemeSelector />
          </section>

          <section aria-labelledby="account-session" className={styles.panel}>
            <h2 className={styles.panelTitle} id="account-session">Session</h2>
            <p className={styles.panelNote}>
              You are signed in on this device. A session lasts {sessionMaxAgeDays} days of inactivity
              unless you sign out. Signing out ends it here and leaves your Dossier and documents intact.
            </p>
            <form action={signOutAction}>
              <button className={styles.signOutButton} type="submit">Sign out</button>
            </form>
          </section>
        </div>
      </Container>
    </div>
  );
}
