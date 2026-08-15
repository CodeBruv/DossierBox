import Link from "next/link";
import { Container } from "@/ui";
import { authConfiguration, signIn } from "@/auth/auth";
import { SignInButton } from "@/auth/sign-in-button";
import { getSafeRedirect } from "@/auth/redirects";
import styles from "@/styles/pages/auth.module.css";

type SignInPageProps = {
  searchParams: Promise<{
    callbackUrl?: string;
    error?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  AccessDenied: "Google did not grant access. No account was created.",
  Configuration: "Authentication is not configured yet. Add the server credentials and try again.",
  OAuthAccountNotLinked: "This email is already connected through another sign-in method.",
  OAuthCallbackError: "Google sign-in was cancelled or could not be completed. Try again.",
  OAuthSignin: "Google sign-in could not be started. Try again.",
  SessionRequired: "Your session ended. Sign in again to continue.",
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const callbackUrl = getSafeRedirect(params.callbackUrl);
  const errorMessage = params.error ? errorMessages[params.error] ?? "Sign-in could not be completed. Try again." : null;

  return (
    <div className={styles.page}>
      <Container>
        <section className={styles.panel} aria-labelledby="sign-in-title">
          <p className={styles.eyebrow}>DossierBox account</p>
          <h1 id="sign-in-title" className={styles.title}>
            Sign in to DossierBox
          </h1>
          <p className={styles.lead}>
            Use your Google account to access your DossierBox account. Your career information remains a separate profile you control.
          </p>

          {errorMessage ? (
            <p className={styles.status} role="alert">
              {errorMessage}
            </p>
          ) : null}

          {!authConfiguration ? (
            <p className={styles.status} role="status">
              Google sign-in is unavailable until the server credentials and
              database connection are configured.
            </p>
          ) : null}

          <form
            className={styles.authForm}
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: callbackUrl });
            }}
          >
            <SignInButton disabled={!authConfiguration} />
          </form>

          <p className={styles.notice}>
            Google handles identity verification. DossierBox never receives your Google password.
          </p>
          <Link className={styles.returnLink} href="/">
            Return to DossierBox
          </Link>
        </section>
      </Container>
    </div>
  );
}
