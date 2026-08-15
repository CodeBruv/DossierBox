import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "./database";
import { accounts, sessions, users, verificationTokens } from "./schema";

const googleClientId = process.env.GOOGLE_CLIENT_ID ?? "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
const authSecret = process.env.NEXTAUTH_SECRET ?? "";

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
    maxAge: 30 * 24 * 60 * 60,
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
    authorized({ auth: session, request }) {
      if (!request.nextUrl.pathname.startsWith("/account")) {
        return true;
      }

      return Boolean(session?.user);
    },
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
