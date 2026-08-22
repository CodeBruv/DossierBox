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
  profileReview: "/profile/review",
  terms: "/terms",
  privacy: "/privacy",
  contact: "/contact",
} as const;

/**
 * Secondary footer groups. The footer is deliberately not a second copy of the
 * header: it carries acquisition and legal links only, and nothing that the
 * sticky header already provides.
 */
export const footerGroups: { id: string; label: string; links: NavLink[] }[] = [
  {
    id: "product",
    label: "Product",
    links: [
      { id: "templates", label: "Templates", href: "/templates" },
      { id: "how", label: "How it works", href: "/how-it-works" },
      { id: "pricing", label: "Pricing", href: "/pricing" },
    ],
  },
  {
    id: "company",
    label: "Company",
    links: [
      { id: "contact", label: "Contact", href: "/contact" },
      { id: "terms", label: "Terms", href: "/terms" },
      { id: "privacy", label: "Privacy", href: "/privacy" },
    ],
  },
] as const;

/**
 * Signed-in users get legal links only. Product marketing pages are acquisition
 * surfaces; showing them under someone's own workspace is noise, and the header
 * already owns Home / Dossier / Documents / Account.
 */
export const footerLegalLinks: NavLink[] = [
  { id: "terms", label: "Terms", href: "/terms" },
  { id: "privacy", label: "Privacy", href: "/privacy" },
  { id: "contact", label: "Contact", href: "/contact" },
] as const;
