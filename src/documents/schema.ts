import { randomUUID } from "node:crypto";
import { index, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "@/auth/schema";

export const documentType = pgEnum("document_type", [
  "professional_cv",
  "professional_resume",
  "academic_cv",
]);

export const documentStatus = pgEnum("document_status", ["draft"]);

/**
 * A document.
 *
 * Deliberately narrow. A document stores what the user *decided* — its family, its
 * name, the style it is presented in, and which sections they chose to leave out —
 * and none of what it *says*. Every fact on the page is read from the dossier at
 * render time.
 *
 * That is the point of the model rather than an optimisation. If a job title were
 * copied in here, correcting it in the dossier would leave this document quietly
 * wrong, and the user would have no way to know which of the two was true. Keeping
 * the facts in one place is what makes "update your dossier and every document
 * follows" an actual property of the system instead of a promise.
 *
 * It is also why there are no version rows yet. Reproducing an old document means
 * storing the dossier as it read at the time, which is a real feature with real
 * storage and retention consequences — not a column. This model does not block it:
 * a version is a snapshot plus one of these configurations.
 */
export const documents = pgTable(
  "documents",
  {
    id: text("id").$defaultFn(() => randomUUID()).notNull().primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: documentType("type").notNull(),
    title: text("title").notNull(),
    status: documentStatus("status").notNull().default("draft"),
    /**
     * Which visual style presents this document.
     *
     * Plain text, not an enum, because the set of templates is presentation data
     * that will change more often than the database should. A value the current
     * build does not recognise falls back to the family default at render time
     * rather than failing, so removing a template cannot make a document
     * unopenable. `presentation.ts` owns the vocabulary.
     */
    template: text("template").notNull().default("classic"),
    /**
     * Sections the user chose to leave out of this document.
     *
     * Stored as the exclusions rather than the inclusions, so a document does not
     * silently omit a section the user adds to their dossier later — a new section
     * appears by default, which is the behaviour someone filling in their profile
     * expects. It also means the column is empty for the common case.
     *
     * JSONB is appropriate here: this is a short, unordered set read only with its
     * own document, never joined or filtered on. Section *order* is not stored,
     * because it belongs to the document family in the composition layer.
     */
    hiddenSections: jsonb("hiddenSections").$type<string[]>().notNull().default([]),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => ({
    userUpdatedIndex: index("documents_userId_updatedAt_idx").on(
      table.userId,
      table.updatedAt,
    ),
  }),
);

export type DocumentType = (typeof documentType.enumValues)[number];
