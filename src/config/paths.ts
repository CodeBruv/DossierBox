/**
 * DossierBox — navigation & route configuration.
 *
 * This is the single source of truth for the primary navigation and the
 * canonical route paths used by the shell. Keeping it in one place means
 * later blocks (auth, dashboard, document editor) can extend it without
 * hunting through page files.
 */

/** A primary navigation item shown in the header. */
export interface NavLink {
  /** Stable key, not displayed. */
  id: string;
  /** Display label shown in the navigation. International, plain English. */
  label: string;
  /** Absolute route path beginning with /. */
  href: string;
}

/**
 * Primary navigation, in display order. Public routes remain separate from
 * account routes so the shell can evolve without exposing private workflows.
 */
export const navLinks: NavLink[] = [
  { id: "landing",  label: "Home",       href: "/" },
  { id: "templates", label: "Templates",  href: "/templates" },
  { id: "how",       label: "How it works", href: "/how-it-works" },
  { id: "pricing",   label: "Pricing",    href: "/pricing" },
] as const;

/**
 * Auth-related links live separately so the header can render them in a
 * distinct region (top-right) from the primary nav.
 */
export const authLinks: NavLink[] = [
  { id: "signin",  label: "Sign in",    href: "/auth/sign-in"  },
  { id: "signup",  label: "Get started", href: "/auth/sign-up" },
] as const;

/** Canonical public routes (extends as the shell grows). */
export const routes = {
  landing: "/",
  templates: "/templates",
  howItWorks: "/how-it-works",
  pricing: "/pricing",
  signIn: "/auth/sign-in",
  signUp: "/auth/sign-up",
  account: "/account",
  home: "/home",
  documents: "/documents",
  profile: "/profile",
  profileBasics: "/profile/basics",
  profileSections: "/profile/sections",
} as const;
