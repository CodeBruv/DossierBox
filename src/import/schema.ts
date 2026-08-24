import { randomUUID } from "node:crypto";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "@/auth/schema";
import type { ImportResult } from "./candidates";

/**
 * An uploaded career document, between reading it and the user confirming it.
 *
 * This table exists so that importing is a *review* step rather than a write. The
 * upload is read in the request that received it, turned into candidates, and stored
 * here; the user then confirms or corrects them, and only that confirmation writes to
 * their dossier. Without somewhere to keep the reading, the review screen would either
 * have to re-parse the file on every keystroke or the parser's guesses would have to go
 * straight into the profile — which is exactly what the product forbids.
 *
 * Three deliberate properties:
 *
 * - **The file itself is not stored.** Only the extracted candidates are, so an
 *   abandoned import leaves no copy of the user's document anywhere.
 * - **Rows are short-lived.** The row is deleted when the user finishes with the
 *   import, and it holds nothing that is not already on its way into the dossier.
 * - **JSONB, deliberately.** A candidate is a proposal with per-field notes and the
 *   source lines it was read from; it is never queried, filtered or joined, only read
 *   back whole by the review screen. Modelling a discarded proposal as relational rows
 *   would be a second copy of the entire dossier schema for data whose purpose is to be
 *   thrown away.
 */
export const documentImports = pgTable(
  "documentImports",
  {
    id: text("id").$defaultFn(() => randomUUID()).notNull().primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** What the user called their file, shown back to them so they know what they uploaded. */
    filename: text("filename").notNull(),
    /** `pdf` or `docx`. Text rather than an enum: a third reader should not need a migration. */
    format: text("format").notNull(),
    result: jsonb("result").$type<ImportResult>().notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => ({
    userCreatedIndex: index("documentImports_userId_createdAt_idx").on(
      table.userId,
      table.createdAt,
    ),
  }),
);
