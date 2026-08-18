"use client";

import { useEffect, useRef, useState } from "react";
import { setThemePreference, storageKey, type ThemePreference } from "./theme-provider";
import styles from "@/styles/ui/theme-menu.module.css";

const options: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function ThemeMenu() {
  const [open, setOpen] = useState(false);
  const [preference, setPreference] = useState<ThemePreference>("system");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === "light" || stored === "dark" || stored === "system") setPreference(stored);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function choose(value: ThemePreference) {
    setPreference(value);
    setThemePreference(value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Theme: ${preference}. Choose theme`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={styles.themeIcon} aria-hidden="true" />
        <span className={styles.label}>Theme</span>
      </button>
      {open ? (
        <div className={styles.menu} role="menu" aria-label="Theme preference">
          <strong>Theme</strong>
          {options.map((option) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={preference === option.value}
              className={styles.option}
              key={option.value}
              onClick={() => choose(option.value)}
            >
              <span className={styles.optionIndicator} aria-hidden="true" />
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
