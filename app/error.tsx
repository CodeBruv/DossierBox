"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Container } from "@/ui";
import styles from "@/styles/pages/error.module.css";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("[app] Unhandled route error", error);
  }, [error]);

  return (
    <main className={styles.page}>
      <Container>
        <section className={styles.panel} aria-labelledby="route-error-title">
          <p className={styles.eyebrow}>Something went wrong</p>
          <h1 className={styles.title} id="route-error-title">This part of DossierBox could not be loaded.</h1>
          <p className={styles.description}>Try loading it again. Your saved dossier and documents have not been changed.</p>
          <div className={styles.actions}>
            <button className={styles.primaryButton} onClick={reset} type="button">Try again</button>
            <Link className={styles.secondaryButton} href="/home">Back to Home</Link>
          </div>
        </section>
      </Container>
    </main>
  );
}
