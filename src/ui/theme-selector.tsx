"use client";

import { useEffect, useState } from "react";
import {
  setThemePreference,
  storageKey,
  type ThemePreference,
} from "./theme-provider";
import styles from "@/styles/ui/theme-selector.module.css";

const themeOptions: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function ThemeSelector() {
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === "light" || stored === "dark" || stored === "system") {
      setPreference(stored);
    }
  }, []);

  function handleChange(nextPreference: ThemePreference) {
    setPreference(nextPreference);
    setThemePreference(nextPreference);
  }

  return (
    <fieldset className={styles.selector}>
      <legend>Theme</legend>
      <div className={styles.options} role="radiogroup" aria-label="Theme preference">
        {themeOptions.map((option) => (
          <label className={styles.option} key={option.value}>
            <input
              type="radio"
              name="theme-preference"
              value={option.value}
              checked={preference === option.value}
              onChange={() => handleChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
