import { randomUUID } from "node:crypto";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import type { AdapterAccount } from "next-auth/adapters";

export const users = pgTable("users", {
  id: text("id").$defaultFn(() => randomUUID()).notNull().primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date", withTimezone: true }),
  image: text("image"),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccount["type"]>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  }),
);

export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").notNull().primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationTokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
  },
  (verificationToken) => ({
    compoundKey: primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  }),
);

export const authTokenPurpose = pgEnum("auth_token_purpose", [
  "email_verification",
  "password_reset",
]);

export const authCredentials = pgTable("auth_credentials", {
  userId: text("userId")
    .notNull()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("passwordHash").notNull(),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: text("id").$defaultFn(() => randomUUID()).notNull().primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: authTokenPurpose("purpose").notNull(),
    tokenHash: text("tokenHash").notNull(),
    expiresAt: timestamp("expiresAt", { mode: "date", withTimezone: true }).notNull(),
    consumedAt: timestamp("consumedAt", { mode: "date", withTimezone: true }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => ({
    tokenHashUnique: unique("auth_tokens_tokenHash_unique").on(table.tokenHash),
    tokenHashIndex: index("auth_tokens_tokenHash_idx").on(table.tokenHash),
    userPurposeIndex: index("auth_tokens_userId_purpose_idx").on(
      table.userId,
      table.purpose,
    ),
    expiryIndex: index("auth_tokens_expiresAt_idx").on(table.expiresAt),
  }),
);

export const authRateLimits = pgTable(
  "auth_rate_limits",
  {
    id: text("id").$defaultFn(() => randomUUID()).notNull().primaryKey(),
    limiterKey: text("limiterKey").notNull(),
    action: text("action").notNull(),
    windowStart: timestamp("windowStart", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    attemptCount: integer("attemptCount").notNull().default(0),
    expiresAt: timestamp("expiresAt", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => ({
    actionKeyWindowUnique: unique("auth_rate_limits_action_key_window_unique").on(
      table.action,
      table.limiterKey,
      table.windowStart,
    ),
    lookupIndex: index("auth_rate_limits_action_key_idx").on(
      table.action,
      table.limiterKey,
    ),
    expiryIndex: index("auth_rate_limits_expiresAt_idx").on(table.expiresAt),
  }),
);
