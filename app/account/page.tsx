import Link from "next/link";
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
        <section className={styles.panel} aria-labelledby="account-title">
          <p className={styles.eyebrow}>Settings</p>
          <h1 id="account-title" className={styles.title}>
            Account and preferences
          </h1>
          <p className={styles.lead}>
            Manage your connected identity and account session. Your professional information remains in your dossier.
          </p>

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

          <ThemeSelector />

          <Link className={styles.profileLink} href="/home">
            Return to your workspace
          </Link>

          <form action={signOutAction}>
            <button className={styles.signOutButton} type="submit">
              Sign out
            </button>
          </form>

          <Link className={styles.returnLink} href="/profile">
            Open your dossier
          </Link>
        </section>
      </Container>
    </div>
  );
}
