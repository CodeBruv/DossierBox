import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import type { Session } from "next-auth";
import { auth } from "./auth";

/**
 * Auth.js cookie names for the session token. The `__Secure-` prefix is used
 * whenever cookies are marked secure, which is every deployed environment, so
 * both have to be considered. Auth.js also chunks large cookies by appending
 * `.0`, `.1`, so the check is a prefix match rather than an equality test.
 */
const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

/**
 * Whether a cookie name is one of Auth.js's session-token cookies.
 *
 * Exported for testing: getting this wrong in either direction is severe. Too
 * strict and signed-in users are silently treated as anonymous; too loose and the
 * database read is never skipped, which quietly undoes the optimisation.
 */
export function isSessionCookieName(name: string): boolean {
  return SESSION_COOKIE_NAMES.some(
    (candidate) => name === candidate || name.startsWith(`${candidate}.`),
  );
}

async function hasSessionCookie(): Promise<boolean> {
  const store = await cookies();
  return store.getAll().some((cookie) => isSessionCookieName(cookie.name));
}

/**
 * The session for the current server request, or null when there is no signed-in
 * user.
 *
 * Use this everywhere instead of importing `auth` directly in a page or layout.
 * `auth()` remains the right call inside route handlers, which are not part of a
 * render pass.
 *
 * Three things are happening here, each solving a measured problem:
 *
 * 1. Memoization. The session strategy is "database", so every `auth()` call asks
 *    the adapter for the session row and its user. A single authenticated render
 *    calls it at least twice — once in the root layout to shape the header, and
 *    once in the page itself — and neither call knows about the other. React's
 *    `cache` collapses them into one query per request while staying isolated
 *    between requests and between users, so there is no cross-user cache to
 *    poison.
 *
 * 2. Skipping the database for anonymous visitors. The root layout reads the
 *    session on every route, including the public landing, pricing and templates
 *    pages. A visitor with no session cookie cannot have a session, so asking the
 *    database is guaranteed to return nothing. Checking the cookie first makes
 *    public page views cost zero database round trips instead of one to the
 *    database region.
 *
 * 3. Degrading instead of failing. `auth()` throws when the secret is missing or
 *    the database is unreachable. Because it is called from the root layout, an
 *    unhandled throw takes down every page in the product — including the public
 *    marketing pages, which do not depend on authentication at all. Treating a
 *    failed session read as "not signed in" fails closed: it can only ever remove
 *    access, never grant it. Callers that require a user already redirect to
 *    sign-in, so a database blip sends someone to sign in rather than showing them
 *    an error page, and the real cause is logged server-side.
 */
export const getSession = cache(async function getSession(): Promise<Session | null> {
  if (!(await hasSessionCookie())) {
    return null;
  }

  try {
    return await auth();
  } catch (error) {
    console.error("[auth] Session lookup failed; treating request as signed out", error);
    return null;
  }
});
