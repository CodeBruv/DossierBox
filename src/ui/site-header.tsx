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
  const isProduct = authenticated || pathname === "/home" || pathname.startsWith("/documents") || pathname.startsWith("/profile") || pathname.startsWith("/account");
  const links = isProduct ? productLinks : navLinks;

  function closeMenu() {
    setMenuOpen(false);
    document.body.style.overflow = "";
  }

  useEffect(() => {
    closeMenu();
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
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
          <button type="button" className={styles.backdrop} aria-label="Close navigation menu" onClick={closeMenu} />
          <div id="mobile-menu" className={styles.mobileDrawer} role="dialog" aria-modal="true" aria-label="Navigation menu">
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
