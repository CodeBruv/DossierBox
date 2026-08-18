"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Container } from "./container";
import { SkipLink } from "./skip-link";
import { NavMenu } from "./nav-menu";
import { AuthEntry } from "./auth-entry";
import { ThemeMenu } from "./theme-menu";
import { navLinks } from "@/config/paths";
import styles from "@/styles/ui/site-header.module.css";

export interface SiteHeaderProps {
  currentPath?: string;
  authenticated?: boolean;
}

const productLinks = [
  { id: "home", label: "Home", href: "/home" },
  { id: "dossier", label: "Dossier", href: "/profile" },
  { id: "documents", label: "Documents", href: "/documents" },
  { id: "account", label: "Account", href: "/account" },
] as const;

export function SiteHeader({ currentPath = "/", authenticated = false }: SiteHeaderProps) {
  const pathname = usePathname() ?? currentPath;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLDivElement>(null);
  const isProduct = authenticated;
  const links = isProduct ? productLinks : navLinks;

  function closeMenu(restoreFocus = false) {
    setMenuOpen(false);
    document.body.style.overflow = "";
    if (restoreFocus) menuButtonRef.current?.focus();
  }

  useEffect(() => {
    closeMenu();
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const previousOverflow = document.body.style.overflow;
    const drawer = mobileDrawerRef.current;
    const focusableElements = drawer
      ? Array.from(
          drawer.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        )
      : [];

    document.body.style.overflow = "hidden";
    (focusableElements[0] ?? drawer)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu(true);
        return;
      }

      if (event.key !== "Tab" || focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  function handleNavigate() {
    closeMenu();
  }

  return (
    <header className={styles.header}>
      <SkipLink target="#main-content" />
      <div className={styles.inner}>
        <Container>
          <div className={styles.bar}>
            <Link href={isProduct ? "/home" : "/"} className={styles.logo} aria-label="DossierBox — Home">
              DossierBox
            </Link>
            <nav className={styles.desktopNav} aria-label={isProduct ? "Product" : "Primary"}>
              <NavMenu links={links} currentPath={pathname} horizontal />
            </nav>
            <div className={styles.utilities}>
              <ThemeMenu />
              {!isProduct ? <AuthEntry /> : null}
              <button
                ref={menuButtonRef}
                type="button"
                className={styles.menuButton}
                aria-expanded={menuOpen}
                aria-controls="mobile-menu"
                aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span className={styles.menuIcon} aria-hidden="true" />
                <span className={styles.menuIcon} aria-hidden="true" />
                <span className={styles.menuIcon} aria-hidden="true" />
              </button>
            </div>
          </div>
        </Container>
      </div>
      {menuOpen ? (
        <>
          <button type="button" className={styles.backdrop} aria-label="Close navigation menu" tabIndex={-1} onClick={() => closeMenu(true)} />
          <div
            ref={mobileDrawerRef}
            id="mobile-menu"
            className={styles.mobileDrawer}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            tabIndex={-1}
          >
            <Container>
              <nav className={styles.mobileNav} aria-label={isProduct ? "Product" : "Primary"}>
                <NavMenu links={links} currentPath={pathname} onNavigate={handleNavigate} />
                {!isProduct ? <div className={styles.mobileAuth}><AuthEntry /></div> : null}
              </nav>
            </Container>
          </div>
        </>
      ) : null}
    </header>
  );
}
