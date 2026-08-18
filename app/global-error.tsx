"use client";

import { useEffect } from "react";
import styles from "@/styles/pages/error.module.css";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("[app] Unhandled root error", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className={styles.page}>
          <div className={styles.panel}>
            <p className={styles.eyebrow}>DossierBox unavailable</p>
            <h1 className={styles.title}>The application could not be loaded.</h1>
            <p className={styles.description}>Try loading DossierBox again. Saved dossier and document data is stored separately.</p>
            <div className={styles.actions}>
              <button className={styles.primaryButton} onClick={reset} type="button">Try again</button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
