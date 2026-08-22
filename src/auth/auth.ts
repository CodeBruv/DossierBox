import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "./database";
import { accounts, sessions, users, verificationTokens } from "./schema";

/**
 * Auth.js v5 renamed its environment variables: the framework auto-detects
 * AUTH_SECRET / AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET, while v4 used
 * NEXTAUTH_SECRET / GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.
 *
 * Both are accepted here, because reading only one name means a deployment
 * configured against the other convention silently reports a Configuration
 * error even though the credentials are present.
 *
 * These resolve to `undefined` rather than "" when absent. Passing an empty
 * string to NextAuth is not the same as omitting the value: it overrides the
 * framework's own environment detection with a falsy secret, which disables
 * authentication even when the variable is correctly set.
 */
const googleClientId = process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID || undefined;
const googleClientSecret =
  process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET || undefined;
const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || undefined;

/**
 * Session lifetime, in days. Exported so the Account page can state the real
 * value instead of a hard-coded number that would quietly go stale.
 */
export const sessionMaxAgeDays = 30;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  trustHost: true,
  secret: authSecret,
  session: {
    strategy: "database",
    maxAge: sessionMaxAgeDays * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  providers: [
    Google({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      authorization: {
        params: {
          prompt: "select_account",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],
  pages: {
    signIn: "/auth/sign-in",
    error: "/auth/sign-in",
  },
  callbacks: {
    /*
      There is deliberately no `authorized` callback here. It only runs from
      middleware, and this application has no middleware file — one that imported
      this module would drag the Drizzle adapter and the `postgres` driver into the
      Edge runtime, where TCP sockets do not exist.

      Protection is enforced in the pages themselves (`requireProfileUser`, and the
      session check in app/account/page.tsx), which is the authoritative place for
      it: middleware cannot verify ownership of a specific record, and a callback
      here that appeared to guard `/account` would invite the belief that route
      protection lives in one place when it does not.
    */
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});

export const authSessionConfiguration = Boolean(
  authSecret && process.env.DATABASE_URL,
);

export const authConfiguration = Boolean(
  googleClientId && googleClientSecret && authSessionConfiguration,
);

/**
 * Server-side startup diagnostic.
 *
 * When configuration is incomplete the app redirects to
 * /auth/sign-in?error=Configuration, which is deliberately vague to the user
 * and therefore very hard to debug in a hosted environment. This names the
 * missing variables in the server log only.
 *
 * It logs variable NAMES, never values, and runs server-side only — this
 * module is reached through `./database`, which is `server-only`.
 */
if (!authConfiguration) {
  const missing = [
    !authSecret && "AUTH_SECRET (or NEXTAUTH_SECRET)",
    !process.env.DATABASE_URL && "DATABASE_URL",
    !googleClientId && "AUTH_GOOGLE_ID (or GOOGLE_CLIENT_ID)",
    !googleClientSecret && "AUTH_GOOGLE_SECRET (or GOOGLE_CLIENT_SECRET)",
  ].filter(Boolean);

  console.error(
    `[auth] Authentication is disabled. Missing environment variables: ${missing.join(", ")}. ` +
      "Google sign-in will report a Configuration error until these are set for this environment.",
  );
}
