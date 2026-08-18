import { redirect } from "next/navigation";
import { auth, authSessionConfiguration } from "@/auth/auth";
import { signOutAction } from "@/auth/actions";
import { Container, ThemeSelector } from "@/ui";
import styles from "@/styles/pages/auth.module.css";

export default async function AccountPage() {
  if (!authSessionConfiguration) {
    redirect("/auth/sign-in?callbackUrl=%2Faccount&error=Configuration");
  }

  const session = await auth();

  if (!session?.user) {
    redirect("/auth/sign-in?callbackUrl=%2Faccount&error=SessionRequired");
  }

  return (
    <div className={styles.page}>
      <Container>
        <div className={styles.accountLayout}>
          <header className={styles.accountHeader}>
            <p className={styles.eyebrow}>Account</p>
            <h1 id="account-title" className={styles.title}>
              Account and settings
            </h1>
            <p className={styles.lead}>
              Manage your account, appearance, and session. Your professional information remains in your Dossier.
            </p>
          </header>

          <section className={styles.settingsSection} aria-labelledby="profile-account-title">
            <h2 id="profile-account-title">Account information</h2>
            <dl className={styles.accountDetails}>
              <div>
                <dt>Name</dt>
                <dd>{session.user.name ?? "Not provided"}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{session.user.email ?? "Not provided"}</dd>
              </div>
            </dl>
          </section>

          <section className={styles.settingsSection} aria-labelledby="appearance-title">
            <h2 id="appearance-title">Appearance</h2>
            <p className={styles.sectionDescription}>Choose how DossierBox should appear on this device.</p>
            <ThemeSelector />
          </section>

          <section className={styles.settingsSection} aria-labelledby="security-title">
            <h2 id="security-title">Security</h2>
            <p className={styles.sectionDescription}>Google manages authentication for this account. Password and session management will be added when the supporting infrastructure is available.</p>
          </section>

          <section className={styles.settingsSection} aria-labelledby="data-title">
            <h2 id="data-title">Data</h2>
            <p className={styles.sectionDescription}>Your Dossier is the source of truth for documents created in DossierBox.</p>
          </section>

          <section className={styles.accountActionsSection} aria-labelledby="account-actions-title">
            <h2 id="account-actions-title">Account actions</h2>
            <form action={signOutAction}>
              <button className={styles.signOutButton} type="submit">
                Sign out
              </button>
            </form>
          </section>
        </div>
      </Container>
    </div>
  );
}
