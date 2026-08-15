import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, authSessionConfiguration } from "@/auth/auth";
import { signOutAction } from "@/auth/actions";
import { Container } from "@/ui";
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
          <p className={styles.eyebrow}>DossierBox account</p>
          <h1 id="account-title" className={styles.title}>
            Your account
          </h1>
          <p className={styles.lead}>
            Your identity is connected. Career information will stay in a
            separate profile that you control.
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

          <Link className={styles.profileLink} href="/profile">
            Edit your career profile
          </Link>

          <form action={signOutAction}>
            <button className={styles.signOutButton} type="submit">
              Sign out
            </button>
          </form>

          <Link className={styles.returnLink} href="/">
            Return to DossierBox
          </Link>
        </section>
      </Container>
    </div>
  );
}
