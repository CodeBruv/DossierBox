import { randomUUID } from "node:crypto";
import { index, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "@/auth/schema";
import { applications } from "@/applications/schema";

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
    applicationId: text("applicationId").references(() => applications.id, { onDelete: "set null" }),
    type: documentType("type").notNull(),
    title: text("title").notNull(),
    status: documentStatus("status").notNull().default("draft"),
    /**
     * Which Presentation Style presents this document.
     *
     * Transitional legacy storage field: the canonical domain/API name is Presentation
     * Style, but existing rows and migration history use `template`. Plain text, not an
     * enum, because the set of presentation styles is presentation data that will change
     * more often than the database should. A value the current build does not recognise
     * falls back to the family default at render time rather than failing, so retiring a
     * Presentation Style cannot make a document
     * unopenable. `presentation.ts` owns the vocabulary. Do not rename this column without
     * an explicit compatibility migration.
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
     * own document, never joined or filtered on.
     */
    hiddenSections: jsonb("hiddenSections").$type<string[]>().notNull().default([]),
    /**
     * The order the user arranged this document's sections into.
     *
     * Empty means "the order this document type declares", which is why the default is
     * `[]` rather than a copy of the catalogue order. Freezing today's ordering into
     * every new row would mean a type whose running order improves later improves for
     * nobody, and it would make an unmodified document indistinguishable from one the
     * user deliberately arranged.
     *
     * Per document, never per dossier: two documents built from the same career history
     * can lead with different sections, which is most of what makes them different
     * documents. Unrecognised or missing keys are resolved at composition time rather
     * than constrained here, so a stale order cannot make a document unopenable.
     */
    sectionOrder: jsonb("sectionOrder").$type<string[]>().notNull().default([]),
    /**
     * What the user is applying for, as recorded on the create screen.
     *
     * Nullable: documents created before objectives existed have none, and a document
     * with no stated purpose is still a valid document — every fact on the page comes
     * from the dossier either way. Stored as JSON because it is a small, self-contained
     * record read only with its own document; `@/applications` owns its shape and
     * re-validates it on read, so a value written by an older build degrades to "no
     * objective" instead of breaking the page.
     */
    objective: jsonb("objective").$type<unknown>(),
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
    applicationIndex: index("documents_applicationId_idx").on(table.applicationId),
  }),
);

export type DocumentType = (typeof documentType.enumValues)[number];
