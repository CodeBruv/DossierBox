/**
 * NavMenu — primary navigation.
 *
 * Renders the public nav links passed via props (from src/config/paths.ts).
 * This is a purely presentational component: it receives `links` and an
 * optional active label, and invokes `onNavigate` when a link is clicked.
 *
 * The same component is reused by both the desktop header and the mobile
 * drawer, so navigation stays consistent across viewports.
 */
import Link from "next/link";
import styles from "@/styles/ui/nav-menu.module.css";
import { cx } from "@/lib/cx";
import type { NavLink } from "@/config/paths";

export interface NavMenuProps {
  links: NavLink[];
  currentPath?: string;
  horizontal?: boolean;
}

export function NavMenu({ links, currentPath = "/", horizontal = false }: NavMenuProps) {
  return (
    <ul className={cx(styles.list, { [styles.horizontal]: horizontal })} role="menubar">
      {links.map((link) => {
        const active = currentPath === link.href;
        return (
          <li key={link.id} role="none">
            <Link
              href={link.href}
              className={cx(styles.link, { [styles.active]: active })}
              aria-current={active ? "page" : undefined}
            >
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
