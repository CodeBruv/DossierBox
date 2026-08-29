import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "@/auth/schema";
import { applications } from "@/applications/schema";
import { documents } from "./schema";
import { generatedContentVersions } from "./generation-schema";

const id = () => randomUUID();
const now = () => new Date();

/** Immutable, user-owned snapshots accepted from durable Generated Content. */
export const documentVersions = pgTable(
  "document_versions",
  {
    id: text("id").$defaultFn(id).notNull().primaryKey(),
    documentId: text("documentId").notNull().references(() => documents.id, { onDelete: "restrict" }),
    userId: text("userId").notNull().references(() => users.id, { onDelete: "restrict" }),
    applicationId: text("applicationId").notNull().references(() => applications.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    sourceGeneratedContentVersionId: text("sourceGeneratedContentVersionId").notNull().references(() => generatedContentVersions.id, { onDelete: "restrict" }),
    sourceSpecificationId: text("sourceSpecificationId").notNull(),
    sourceSpecificationRevision: integer("sourceSpecificationRevision").notNull(),
    sourceSpecificationFingerprint: text("sourceSpecificationFingerprint").notNull(),
    sourceEvidenceFingerprint: text("sourceEvidenceFingerprint").notNull(),
    specification: jsonb("specification").$type<Record<string, unknown>>().notNull(),
    selectedEvidence: jsonb("selectedEvidence").$type<readonly Record<string, unknown>[]>().notNull().default([]),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    provenance: jsonb("provenance").$type<Record<string, unknown>>().notNull(),
    configuration: jsonb("configuration").$type<Record<string, unknown>>().notNull().default({}),
    contentFingerprint: text("contentFingerprint").notNull(),
    compilerFingerprint: text("compilerFingerprint").notNull(),
    configurationFingerprint: text("configurationFingerprint").notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).$defaultFn(now).notNull(),
  },
  (table) => ({
    documentVersionUnique: uniqueIndex("document_versions_documentId_version_unique").on(table.documentId, table.version),
    sourceUnique: uniqueIndex("document_versions_sourceGeneratedContentVersionId_unique").on(table.sourceGeneratedContentVersionId),
    documentIndex: index("document_versions_documentId_createdAt_idx").on(table.documentId, table.createdAt),
    ownerIndex: index("document_versions_userId_createdAt_idx").on(table.userId, table.createdAt),
    versionPositive: check("document_versions_version_positive", sql`${table.version} > 0`),
    specificationRevisionPositive: check("document_versions_specificationRevision_positive", sql`${table.sourceSpecificationRevision} > 0`),
  }),
);

export type DocumentVersionRow = typeof documentVersions.$inferSelect;
