import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "@/auth/schema";
import { applications } from "@/applications/schema";
import { documentSpecifications } from "./specification-schema";
import {
  generationAttemptStatuses,
  generationWorkItemStatuses,
  iuLedgerEntryKinds,
  providerExecutionStatuses,
  validationKinds,
  validationStatuses,
} from "./generation-domain";

const id = () => randomUUID();
const now = () => new Date();

const generationStatus = (name: string) => text(name);

export const generationAttempts = pgTable(
  "generation_attempts",
  {
    id: text("id").$defaultFn(id).notNull().primaryKey(),
    userId: text("userId").notNull().references(() => users.id, { onDelete: "restrict" }),
    applicationId: text("applicationId").notNull().references(() => applications.id, { onDelete: "restrict" }),
    specificationId: text("specificationId").notNull().references(() => documentSpecifications.id, { onDelete: "restrict" }),
    specificationRevision: integer("specificationRevision").notNull(),
    specificationFingerprint: text("specificationFingerprint").notNull(),
    evidenceFingerprint: text("evidenceFingerprint").notNull(),
    requestFingerprint: text("requestFingerprint").notNull(),
    idempotencyKey: text("idempotencyKey").notNull(),
    entitlementPlan: text("entitlementPlan").notNull(),
    estimatedUnits: integer("estimatedUnits").notNull(),
    status: generationStatus("status").$type<(typeof generationAttemptStatuses)[number]>().notNull().default("created"),
    failureKind: text("failureKind"),
    failureDetail: jsonb("failureDetail").$type<readonly string[] | null>(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).$defaultFn(now).notNull(),
    completedAt: timestamp("completedAt", { mode: "date", withTimezone: true }),
  },
  (table) => ({
    ownerIdempotencyUnique: uniqueIndex("generation_attempts_userId_idempotencyKey_unique").on(table.userId, table.idempotencyKey),
    requestIndex: index("generation_attempts_userId_requestFingerprint_idx").on(table.userId, table.requestFingerprint),
    ownerStatusIndex: index("generation_attempts_userId_status_createdAt_idx").on(table.userId, table.status, table.createdAt),
    revisionPositive: check("generation_attempts_specificationRevision_positive", sql`${table.specificationRevision} > 0`),
    unitsNonNegative: check("generation_attempts_estimatedUnits_non_negative", sql`${table.estimatedUnits} >= 0`),
    knownStatus: check("generation_attempts_status_check", sql`${table.status} in ('created', 'reserved', 'running', 'succeeded', 'failed', 'cancelled')`),
  }),
);

export const generationWorkItems = pgTable(
  "generation_work_items",
  {
    id: text("id").$defaultFn(id).notNull().primaryKey(),
    attemptId: text("attemptId").notNull().references(() => generationAttempts.id, { onDelete: "restrict" }),
    sectionKey: text("sectionKey").notNull(),
    heading: text("heading").notNull(),
    layout: text("layout").notNull(),
    workOrder: integer("workOrder").notNull(),
    workload: text("workload").notNull(),
    evidenceManifest: jsonb("evidenceManifest").$type<readonly Record<string, unknown>[]>().notNull().default([]),
    contextFingerprint: text("contextFingerprint").notNull(),
    status: generationStatus("status").$type<(typeof generationWorkItemStatuses)[number]>().notNull().default("pending"),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).$defaultFn(now).notNull(),
    completedAt: timestamp("completedAt", { mode: "date", withTimezone: true }),
  },
  (table) => ({
    attemptOrderUnique: uniqueIndex("generation_work_items_attemptId_workOrder_unique").on(table.attemptId, table.workOrder),
    attemptSectionUnique: uniqueIndex("generation_work_items_attemptId_sectionKey_unique").on(table.attemptId, table.sectionKey),
    attemptIndex: index("generation_work_items_attemptId_status_idx").on(table.attemptId, table.status),
    orderNonNegative: check("generation_work_items_workOrder_non_negative", sql`${table.workOrder} >= 0`),
    knownStatus: check("generation_work_items_status_check", sql`${table.status} in ('pending', 'running', 'succeeded', 'failed')`),
  }),
);

export const providerExecutions = pgTable(
  "generation_provider_executions",
  {
    id: text("id").$defaultFn(id).notNull().primaryKey(),
    attemptId: text("attemptId").notNull().references(() => generationAttempts.id, { onDelete: "restrict" }),
    workItemId: text("workItemId").notNull().references(() => generationWorkItems.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    promptId: text("promptId").notNull(),
    requestFingerprint: text("requestFingerprint").notNull(),
    provider: text("provider"),
    model: text("model"),
    status: generationStatus("status").$type<(typeof providerExecutionStatuses)[number]>().notNull(),
    inputTokens: integer("inputTokens"),
    outputTokens: integer("outputTokens"),
    currency: text("currency"),
    amountMinor: integer("amountMinor"),
    failure: text("failure"),
    startedAt: timestamp("startedAt", { mode: "date", withTimezone: true }).notNull(),
    completedAt: timestamp("completedAt", { mode: "date", withTimezone: true }),
  },
  (table) => ({
    workSequenceUnique: uniqueIndex("generation_provider_executions_workItemId_sequence_unique").on(table.workItemId, table.sequence),
    attemptIndex: index("generation_provider_executions_attemptId_idx").on(table.attemptId),
    sequencePositive: check("generation_provider_executions_sequence_positive", sql`${table.sequence} > 0`),
    amountNonNegative: check("generation_provider_executions_amountMinor_non_negative", sql`${table.amountMinor} is null or ${table.amountMinor} >= 0`),
    knownStatus: check("generation_provider_executions_status_check", sql`${table.status} in ('succeeded', 'failed')`),
  }),
);

export const generationValidations = pgTable(
  "generation_validations",
  {
    id: text("id").$defaultFn(id).notNull().primaryKey(),
    attemptId: text("attemptId").notNull().references(() => generationAttempts.id, { onDelete: "restrict" }),
    workItemId: text("workItemId").references(() => generationWorkItems.id, { onDelete: "restrict" }),
    kind: text("kind").$type<(typeof validationKinds)[number]>().notNull(),
    status: text("status").$type<(typeof validationStatuses)[number]>().notNull(),
    fingerprint: text("fingerprint").notNull(),
    issues: jsonb("issues").$type<readonly string[]>().notNull().default([]),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).$defaultFn(now).notNull(),
  },
  (table) => ({
    attemptIndex: index("generation_validations_attemptId_createdAt_idx").on(table.attemptId, table.createdAt),
    knownKind: check("generation_validations_kind_check", sql`${table.kind} in ('provider', 'response', 'normalization', 'integrity', 'provenance', 'compiler', 'required_sections')`),
    knownStatus: check("generation_validations_status_check", sql`${table.status} in ('passed', 'failed', 'warning')`),
  }),
);

export const generatedContentVersions = pgTable(
  "generated_content_versions",
  {
    id: text("id").$defaultFn(id).notNull().primaryKey(),
    attemptId: text("attemptId").notNull().references(() => generationAttempts.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    documentType: text("documentType").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    provenance: jsonb("provenance").$type<Record<string, unknown>>().notNull(),
    contentFingerprint: text("contentFingerprint").notNull(),
    compilerFingerprint: text("compilerFingerprint").notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).$defaultFn(now).notNull(),
  },
  (table) => ({
    attemptVersionUnique: uniqueIndex("generated_content_versions_attemptId_version_unique").on(table.attemptId, table.version),
    attemptIndex: index("generated_content_versions_attemptId_createdAt_idx").on(table.attemptId, table.createdAt),
    versionPositive: check("generated_content_versions_version_positive", sql`${table.version} > 0`),
  }),
);

export const iuAccounts = pgTable("iu_accounts", {
  userId: text("userId").notNull().primaryKey().references(() => users.id, { onDelete: "restrict" }),
  availableUnits: integer("availableUnits").notNull().default(0),
  reservedUnits: integer("reservedUnits").notNull().default(0),
  updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).$defaultFn(now).notNull(),
}, (table) => ({
  availableNonNegative: check("iu_accounts_availableUnits_non_negative", sql`${table.availableUnits} >= 0`),
  reservedNonNegative: check("iu_accounts_reservedUnits_non_negative", sql`${table.reservedUnits} >= 0`),
}));

export const iuLedgerEntries = pgTable(
  "iu_ledger_entries",
  {
    id: text("id").$defaultFn(id).notNull().primaryKey(),
    userId: text("userId").notNull().references(() => users.id, { onDelete: "restrict" }),
    attemptId: text("attemptId").notNull().references(() => generationAttempts.id, { onDelete: "restrict" }),
    kind: text("kind").$type<(typeof iuLedgerEntryKinds)[number]>().notNull(),
    units: integer("units").notNull(),
    entitlementPlan: text("entitlementPlan").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).$defaultFn(now).notNull(),
  },
  (table) => ({
    attemptKindUnique: uniqueIndex("iu_ledger_entries_attemptId_kind_unique").on(table.attemptId, table.kind),
    userCreatedIndex: index("iu_ledger_entries_userId_createdAt_idx").on(table.userId, table.createdAt),
    positiveUnits: check("iu_ledger_entries_units_positive", sql`${table.units} > 0`),
    knownKind: check("iu_ledger_entries_kind_check", sql`${table.kind} in ('reservation', 'allocation', 'release', 'refund', 'compensation')`),
  }),
);

export type GenerationAttemptRow = typeof generationAttempts.$inferSelect;
export type GenerationWorkItemRow = typeof generationWorkItems.$inferSelect;
export type ProviderExecutionRow = typeof providerExecutions.$inferSelect;
export type GeneratedContentVersionRow = typeof generatedContentVersions.$inferSelect;
export type IuLedgerEntryRow = typeof iuLedgerEntries.$inferSelect;

export const generationEvidenceManifestItems = pgTable(
  "generation_evidence_manifest_items",
  {
    attemptId: text("attemptId").notNull().references(() => generationAttempts.id, { onDelete: "restrict" }),
    evidenceId: text("evidenceId").notNull(),
    applicationId: text("applicationId").notNull(),
    sourceType: text("sourceType").notNull(),
    sourceRecordId: text("sourceRecordId").notNull(),
    evidenceFingerprint: text("evidenceFingerprint").notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).$defaultFn(now).notNull(),
  },
  (table) => ({
    primaryKey: primaryKey({ columns: [table.attemptId, table.evidenceId] }),
    evidenceIndex: index("generation_evidence_manifest_items_evidenceId_idx").on(table.evidenceId),
  }),
);
