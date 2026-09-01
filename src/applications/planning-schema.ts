import { randomUUID } from "node:crypto";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "@/auth/schema";
import { documents } from "@/documents/schema";
import { applications } from "./schema";
import { requirements } from "./opportunity-schema";

const id = () => randomUUID();
const now = () => new Date();

export const evidenceSourceType = pgEnum("evidence_source_type", [
  "identity",
  "experience",
  "education",
  "projects",
  "skills",
  "credentials",
  "achievements",
  "languages",
  "publications",
  "memberships",
  "links",
]);
export const evidenceLifecycle = pgEnum("evidence_lifecycle", ["active", "unavailable", "invalidated"]);
export const evidenceConfirmation = pgEnum("evidence_confirmation", ["unreviewed", "confirmed", "rejected"]);
export const matchingStatus = pgEnum("matching_status", ["candidate", "suggested", "accepted", "rejected", "invalidated"]);
export const matchingReviewState = pgEnum("matching_review_state", ["unreviewed", "confirmed", "rejected"]);
export const evidenceSelectionStatus = pgEnum("evidence_selection_status", ["confirmed", "rejected", "stale", "invalidated"]);
export const gapType = pgEnum("gap_type", [
  "no_evidence",
  "weak_evidence",
  "ambiguous_evidence",
  "confirmation_required",
  "dossier_information_needed",
  "administrative_requirement",
  "document_format",
  "other",
]);
export const gapStatus = pgEnum("gap_status", ["open", "acknowledged", "resolved", "waived"]);
export const planStatus = pgEnum("application_plan_status", ["draft", "proposed", "confirmed", "archived"]);
export const planResolutionSource = pgEnum("application_plan_resolution_source", ["deterministic", "user_adjusted"]);
export const planConfirmation = pgEnum("application_plan_confirmation", ["unconfirmed", "confirmed"]);
export const packageStatus = pgEnum("application_package_status", ["draft", "confirmed", "archived"]);
export const packageConfirmation = pgEnum("application_package_confirmation", ["unconfirmed", "confirmed"]);
export const packageMemberRole = pgEnum("application_package_member_role", ["primary", "supporting"]);
export const packageMemberAvailability = pgEnum("application_package_member_availability", ["available", "unavailable"]);
export const packageMemberSpecificationStatus = pgEnum("application_package_member_specification_status", ["not_started", "placeholder"]);
export const packageMemberCompletion = pgEnum("application_package_member_completion", ["planned", "in_progress", "complete"]);

export const evidence = pgTable("application_evidence", {
  id: text("id").$defaultFn(id).notNull().primaryKey(),
  applicationId: text("applicationId").notNull().references(() => applications.id, { onDelete: "cascade" }),
  sourceType: evidenceSourceType("sourceType").notNull(),
  sourceRecordId: text("sourceRecordId").notNull(),
  excerpt: text("excerpt"),
  provenance: jsonb("provenance").$type<Record<string, unknown> | null>(),
  lifecycle: evidenceLifecycle("lifecycle").notNull().default("active"),
  confirmation: evidenceConfirmation("confirmation").notNull().default("unreviewed"),
  relevance: real("relevance"),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).$defaultFn(now).notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).$defaultFn(now).notNull(),
}, (table) => ({ applicationIndex: index("application_evidence_applicationId_idx").on(table.applicationId) }));

export const matchingResults = pgTable("matching_results", {
  id: text("id").$defaultFn(id).notNull().primaryKey(),
  requirementId: text("requirementId").notNull().references(() => requirements.id, { onDelete: "cascade" }),
  evidenceId: text("evidenceId").notNull().references(() => evidence.id, { onDelete: "cascade" }),
  status: matchingStatus("status").notNull().default("candidate"),
  strength: real("strength"),
  explanation: text("explanation"),
  provenance: jsonb("provenance").$type<Record<string, unknown> | null>(),
  reviewState: matchingReviewState("reviewState").notNull().default("unreviewed"),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).$defaultFn(now).notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).$defaultFn(now).notNull(),
}, (table) => ({ requirementIndex: index("matching_results_requirementId_idx").on(table.requirementId), evidenceIndex: index("matching_results_evidenceId_idx").on(table.evidenceId) }));

export const gaps = pgTable("application_gaps", {
  id: text("id").$defaultFn(id).notNull().primaryKey(),
  applicationId: text("applicationId").notNull().references(() => applications.id, { onDelete: "cascade" }),
  requirementId: text("requirementId").references(() => requirements.id, { onDelete: "set null" }),
  type: gapType("type").notNull(),
  description: text("description").notNull(),
  status: gapStatus("status").notNull().default("open"),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).$defaultFn(now).notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).$defaultFn(now).notNull(),
}, (table) => ({ applicationStatusIndex: index("application_gaps_applicationId_status_idx").on(table.applicationId, table.status) }));

export const applicationPlans = pgTable("application_plans", {
  id: text("id").$defaultFn(id).notNull().primaryKey(),
  applicationId: text("applicationId").notNull().references(() => applications.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  status: planStatus("status").notNull().default("draft"),
  resolutionSource: planResolutionSource("resolutionSource").notNull().default("deterministic"),
  confirmation: planConfirmation("confirmation").notNull().default("unconfirmed"),
  recommendedDocuments: jsonb("recommendedDocuments").$type<string[]>().notNull().default([]),
  requirementCoverage: jsonb("requirementCoverage").$type<Record<string, unknown>>().notNull().default({}),
  evidenceCoverage: jsonb("evidenceCoverage").$type<Record<string, unknown>>().notNull().default({}),
  gapsSummary: jsonb("gapsSummary").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).$defaultFn(now).notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).$defaultFn(now).notNull(),
}, (table) => ({
  applicationVersionIndex: index("application_plans_applicationId_version_idx").on(table.applicationId, table.version),
  applicationVersionUnique: uniqueIndex("application_plans_applicationId_version_unique").on(table.applicationId, table.version),
}));

export const applicationPackages = pgTable("application_packages", {
  id: text("id").$defaultFn(id).notNull().primaryKey(),
  planId: text("planId").notNull().references(() => applicationPlans.id, { onDelete: "cascade" }),
  status: packageStatus("status").notNull().default("draft"),
  confirmation: packageConfirmation("confirmation").notNull().default("unconfirmed"),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).$defaultFn(now).notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).$defaultFn(now).notNull(),
});

export const applicationPackageMembers = pgTable("application_package_members", {
  id: text("id").$defaultFn(id).notNull().primaryKey(),
  packageId: text("packageId").notNull().references(() => applicationPackages.id, { onDelete: "cascade" }),
  documentType: text("documentType").notNull(),
  role: packageMemberRole("role").notNull(),
  position: integer("position").notNull(),
  availability: packageMemberAvailability("availability").notNull(),
  specificationStatus: packageMemberSpecificationStatus("specificationStatus").notNull().default("not_started"),
  completion: packageMemberCompletion("completion").notNull().default("planned"),
  documentId: text("documentId").references(() => documents.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).$defaultFn(now).notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).$defaultFn(now).notNull(),
}, (table) => ({ packagePositionIndex: index("application_package_members_packageId_position_idx").on(table.packageId, table.position) }));

/** The authoritative, package-scoped user decision linking one Requirement to Evidence. */
export const evidenceSelections = pgTable("application_evidence_selections", {
  id: text("id").$defaultFn(id).notNull().primaryKey(),
  applicationId: text("applicationId").notNull().references(() => applications.id, { onDelete: "cascade" }),
  packageId: text("packageId").notNull().references(() => applicationPackages.id, { onDelete: "cascade" }),
  requirementId: text("requirementId").notNull().references(() => requirements.id, { onDelete: "cascade" }),
  evidenceId: text("evidenceId").notNull().references(() => evidence.id, { onDelete: "cascade" }),
  status: evidenceSelectionStatus("status").notNull(),
  confirmedAt: timestamp("confirmedAt", { mode: "date", withTimezone: true }),
  confirmedByUserId: text("confirmedByUserId").references(() => users.id, { onDelete: "restrict" }),
  requirementFingerprint: text("requirementFingerprint").notNull(),
  evidenceFingerprint: text("evidenceFingerprint").notNull(),
  matchingResultId: text("matchingResultId").references(() => matchingResults.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).$defaultFn(now).notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).$defaultFn(now).notNull(),
}, (table) => ({
  packageRequirementEvidenceUnique: uniqueIndex("application_evidence_selections_package_requirement_evidence_unique").on(table.packageId, table.requirementId, table.evidenceId),
  packageStatusIndex: index("application_evidence_selections_packageId_status_idx").on(table.packageId, table.status),
  requirementStatusIndex: index("application_evidence_selections_requirementId_status_idx").on(table.requirementId, table.status),
  evidenceStatusIndex: index("application_evidence_selections_evidenceId_status_idx").on(table.evidenceId, table.status),
}));

export type EvidenceSourceType = (typeof evidenceSourceType.enumValues)[number];
export type EvidenceLifecycle = (typeof evidenceLifecycle.enumValues)[number];
export type EvidenceSelectionStatus = (typeof evidenceSelectionStatus.enumValues)[number];
export type MatchingStatus = (typeof matchingStatus.enumValues)[number];
export type GapStatus = (typeof gapStatus.enumValues)[number];
export type PlanStatus = (typeof planStatus.enumValues)[number];
export type PackageMemberRole = (typeof packageMemberRole.enumValues)[number];
