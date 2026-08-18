"use client";

import { useEffect, type ReactNode } from "react";

export type ThemePreference = "system" | "light" | "dark";

export const storageKey = "dossierbox-theme";

function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  root.dataset.theme = preference;
  root.style.colorScheme = preference === "system" ? "light dark" : preference;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    const preference: ThemePreference =
      stored === "light" || stored === "dark" || stored === "system" ? stored : "system";

    applyTheme(preference);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemChange = () => {
      if (window.localStorage.getItem(storageKey) === "system") {
        applyTheme("system");
      }
    };

    mediaQuery.addEventListener("change", handleSystemChange);
    return () => mediaQuery.removeEventListener("change", handleSystemChange);
  }, []);

  return children;
}

export function setThemePreference(preference: ThemePreference) {
  window.localStorage.setItem(storageKey, preference);
  applyTheme(preference);
}
