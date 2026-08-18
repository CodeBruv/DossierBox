import Link from "next/link";
import { Container } from "./container";
import { signOutAction } from "@/auth/actions";
import styles from "@/styles/ui/site-footer.module.css";

export function SiteFooter({ authenticated = false }: { authenticated?: boolean }) {
  const year = new Date().getFullYear();
  const footerLinks = authenticated
    ? [
        { label: "Home", href: "/home" },
        { label: "Dossier", href: "/profile" },
        { label: "Documents", href: "/documents" },
        { label: "Terms", href: "/terms" },
        { label: "Privacy", href: "/privacy" },
      ]
    : [
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
          <div className={styles.branding}>
            <Link href={authenticated ? "/home" : "/"} className={styles.logo}>DossierBox</Link>
            <p className={styles.tagline}>Professional documents from real career information.</p>
          </div>
          <nav aria-label="Footer">
            <ul className={styles.list}>
              {footerLinks.map((link) => <li key={link.href}><Link href={link.href} className={styles.link}>{link.label}</Link></li>)}
            </ul>
          </nav>
          <div className={styles.accountArea}>
            {authenticated ? (
              <div className={styles.accountActions}>
                <Link href="/account" className={styles.link}>Account and settings</Link>
                <form action={signOutAction}><button type="submit" className={styles.signOut}>Sign out</button></form>
              </div>
            ) : (
              <nav aria-label="Account actions" className={styles.accountActions}>
                <Link href="/auth/sign-in" className={styles.link}>Sign in</Link>
                <Link href="/auth/sign-up" className={styles.link}>Get started</Link>
              </nav>
            )}
          </div>
        </div>
        <div className={styles.bottom}><p className={styles.copyright}>© {year} DossierBox. All rights reserved.</p></div>
      </Container>
    </footer>
  );
}
