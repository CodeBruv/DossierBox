/**
 * SiteFooter — secondary navigation and legal links rendered on every page.
 *
 * Contains: copyright, minimal sitemap links (Terms / Privacy / Contact),
 * and the auth entry for mobile convenience. Purely presentational.
 */
import Link from "next/link";
import { Container } from "./container";
import { AuthEntry } from "./auth-entry";
import styles from "@/styles/ui/site-footer.module.css";

export function SiteFooter() {
  const year = new Date().getFullYear();

  const footerLinks = [
    { label: "Templates", href: "/templates" },
    { label: "How it works", href: "/how-it-works" },
    { label: "Pricing", href: "/pricing" },
    { label: "Terms", href: "/terms" },
    { label: "Privacy", href: "/privacy" },
    { label: "Contact", href: "/contact" },
  ];

  return (
    <footer className={styles.footer}>
      <Container wide>
        <div className={styles.columns}>
          {/* Brand + tagline */}
          <div className={styles.branding}>
            <Link href="/" className={styles.logo}>
              DossierBox
            </Link>
            <p className={styles.tagline}>
              Professional documents from real career information.
            </p>
          </div>

          {/* Sitemap */}
          <nav aria-label="Footer">
            <ul className={styles.list}>
              {footerLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={styles.link}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Desktop: auth hidden in footer; mobile keeps it in drawer */}
          <div className={styles.authDesktop}>
            <AuthEntry />
          </div>
        </div>

        <div className={styles.bottom}>
          <p className={styles.copyright}>
            © {year} DossierBox. All rights reserved.
          </p>
        </div>
      </Container>
    </footer>
  );
}
