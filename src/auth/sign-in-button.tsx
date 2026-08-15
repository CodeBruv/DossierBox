"use client";

import { useFormStatus } from "react-dom";
import styles from "@/styles/pages/auth.module.css";

type SignInButtonProps = {
  disabled?: boolean;
};

export function SignInButton({ disabled = false }: SignInButtonProps) {
  const { pending } = useFormStatus();
  const unavailable = disabled || pending;

  return (
    <button className={styles.googleButton} type="submit" disabled={unavailable}>
      <span aria-hidden="true" className={styles.googleMark}>
        G
      </span>
      {pending ? "Opening Google..." : "Continue with Google"}
    </button>
  );
}
