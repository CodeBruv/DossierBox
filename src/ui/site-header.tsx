/**
 * SiteHeader — top navigation bar rendered on every page.
 *
 * Composes the public navigation and account entry points. Private account
 * content is checked server-side at its route boundary.
 */
"use client";

import Link from "next/link";
import { useState } from "react";
import { Container } from "./container";
import { SkipLink } from "./skip-link";
import { NavMenu } from "./nav-menu";
import { AuthEntry } from "./auth-entry";
import { navLinks } from "@/config/paths";
import styles from "@/styles/ui/site-header.module.css";

export interface SiteHeaderProps {
  /** The current pathname, used to mark the active nav link. */
  currentPath?: string;
}

export function SiteHeader({ currentPath = "/" }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className={styles.header}>
      <SkipLink target="#main-content" />

      <div className={styles.inner}>
        <Container>
          <div className={styles.bar}>
            <Link href="/" className={styles.logo} aria-label="DossierBox — Home">
              DossierBox
            </Link>

            {/* Desktop navigation */}
            <nav className={styles.desktopNav} aria-label="Primary">
              <NavMenu links={navLinks} currentPath={currentPath} horizontal />
            </nav>

            {/* Public account entry points; authorization is checked server-side. */}
            <AuthEntry />

            {/* Mobile menu toggle */}
            <button
              type="button"
              className={styles.menuButton}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <span className={styles.menuIcon} aria-hidden="true" />
              <span className={styles.menuIcon} aria-hidden="true" />
              <span className={styles.menuIcon} aria-hidden="true" />
            </button>
          </div>
        </Container>
      </div>

      {/* Mobile drawer — reuses NavMenu */}
      {menuOpen && (
        <div
          id="mobile-menu"
          className={styles.mobileDrawer}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <Container>
            <nav className={styles.mobileNav} aria-label="Primary">
              <NavMenu links={navLinks} currentPath={currentPath} />
              <div className={styles.mobileAuth}>
                <AuthEntry />
              </div>
            </nav>
          </Container>
        </div>
      )}
    </header>
  );
}
