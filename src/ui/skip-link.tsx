/**
 * Skip link — appears first in tab order on every page so keyboard users
 * jump straight to the main content, bypassing the repeated navigation.
 */
import styles from "@/styles/ui/skip-link.module.css";

export function SkipLink({
  label = "Skip to content",
  target = "#main-content",
}: {
  label?: string;
  target?: string;
}) {
  return (
    <a href={target} className={styles.skipLink}>
      {label}
    </a>
  );
}
