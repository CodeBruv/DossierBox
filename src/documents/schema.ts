import { randomUUID } from "node:crypto";
import { index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "@/auth/schema";

export const documentType = pgEnum("document_type", [
  "professional_cv",
  "professional_resume",
  "academic_cv",
]);

export const documentStatus = pgEnum("document_status", ["draft"]);

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
