import { randomUUID } from "node:crypto";
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "@/auth/schema";

export const applicationStatus = pgEnum("application_status", ["draft", "archived"]);

/**
 * The persisted application aggregate.
 *
 * Application context belongs here, not on a document and not in the dossier. The aggregate
 * is intentionally small until opportunity, planning, matching and versioning are introduced.
 */
export const applications = pgTable(
  "applications",
  {
    id: text("id").$defaultFn(() => randomUUID()).notNull().primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: applicationStatus("status").notNull().default("draft"),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => ({
    userUpdatedIndex: index("applications_userId_updatedAt_idx").on(
      table.userId,
      table.updatedAt,
    ),
  }),
);

/**
 * Normalized application intent. The vocabulary and validation remain owned by `@/applications`;
 * this table stores the validated fields separately so intent is not another opaque objective blob.
 */
export const applicationIntents = pgTable("application_intents", {
  applicationId: text("applicationId")
    .notNull()
    .primaryKey()
    .references(() => applications.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  targetRole: text("targetRole"),
  organisation: text("organisation"),
  institution: text("institution"),
  programme: text("programme"),
  field: text("field"),
  country: text("country"),
  deadline: text("deadline"),
  requirements: text("requirements"),
  instructions: text("instructions"),
  wordLimit: integer("wordLimit"),
  pageLimit: integer("pageLimit"),
  requestedDocuments: jsonb("requestedDocuments").$type<string[]>().notNull().default([]),
});

export type ApplicationStatus = (typeof applicationStatus.enumValues)[number];
