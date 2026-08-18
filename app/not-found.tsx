import Link from "next/link";
import { Container } from "@/ui";
import styles from "@/styles/pages/error.module.css";

export default function NotFound() {
  return (
    <main className={styles.page}>
      <Container>
        <section className={styles.panel} aria-labelledby="not-found-title">
          <p className={styles.eyebrow}>Page not found</p>
          <h1 className={styles.title} id="not-found-title">That DossierBox page does not exist.</h1>
          <p className={styles.description}>The link may be outdated, or the item may no longer be available.</p>
          <div className={styles.actions}>
            <Link className={styles.primaryButton} href="/home">Back to Home</Link>
            <Link className={styles.secondaryButton} href="/documents">Open Documents</Link>
          </div>
        </section>
      </Container>
    </main>
  );
}
