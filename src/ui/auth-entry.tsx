/**
 * AuthEntry — the public account entry points in the shell.
 *
 * Session-aware account content stays server-rendered. These links are safe
 * public entry points and never carry career or provider metadata.
 */
import Link from "next/link";
import styles from "@/styles/ui/auth-entry.module.css";
import { Button } from "./button";

export function AuthEntry() {
  return (
    <nav
      className={styles.entry}
      aria-label="Account actions"
      data-testid="auth-entry"
    >
      <Button variant="secondary" size="sm" asChild>
        <Link href="/auth/sign-in">
          Sign in
        </Link>
      </Button>
      <Button variant="primary" size="sm" asChild>
        <Link href="/auth/sign-up">
          Get started
        </Link>
      </Button>
    </nav>
  );
}
