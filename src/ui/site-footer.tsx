import Link from "next/link";
import { Container } from "./container";
import { footerGroups, footerLegalLinks } from "@/config/paths";
import styles from "@/styles/ui/site-footer.module.css";

/**
 * The footer is the quietest surface in the product, and it earns that by not
 * repeating anything.
 *
 * The header is sticky, so Home / Dossier / Documents / Account and the theme
 * control are always one glance away; duplicating them here produced two
 * competing navigations and a second "Sign out" that looked like a different
 * action from the one in Account. Signed-in users therefore get brand, legal
 * links and copyright — nothing more. Marketing links are acquisition surfaces
 * and stay on the public footer where they belong.
 */
export function SiteFooter({ authenticated = false }: { authenticated?: boolean }) {
  const year = new Date().getFullYear();

  return (
    <footer className={authenticated ? styles.footerCompact : styles.footer}>
      <Container wide>
        <div className={authenticated ? styles.compactRow : styles.columns}>
          <div className={styles.branding}>
            <Link className={styles.logo} href={authenticated ? "/home" : "/"}>DossierBox</Link>
            {authenticated ? null : (
              <p className={styles.tagline}>Professional documents from real career information.</p>
            )}
          </div>

          {authenticated ? (
            <nav aria-label="Legal and support">
              <ul className={styles.inlineList}>
                {footerLegalLinks.map((link) => (
                  <li key={link.id}>
                    <Link className={styles.link} href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : (
            <div className={styles.groups}>
              {footerGroups.map((group) => (
                <nav aria-labelledby={`footer-${group.id}`} key={group.id}>
                  {/* A real heading, so the two link sets are distinguishable
                      rather than one undifferentiated column of six links. */}
                  <h2 className={styles.groupLabel} id={`footer-${group.id}`}>{group.label}</h2>
                  <ul className={styles.list}>
                    {group.links.map((link) => (
                      <li key={link.id}>
                        <Link className={styles.link} href={link.href}>{link.label}</Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              ))}
            </div>
          )}
        </div>

        <div className={styles.bottom}>
          <p className={styles.copyright}>© {year} DossierBox. All rights reserved.</p>
        </div>
      </Container>
    </footer>
  );
}
