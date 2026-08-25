import { randomUUID } from "node:crypto";
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { applications } from "./schema";

export const opportunitySourceType = pgEnum("opportunity_source_type", [
  "manual",
  "pasted_text",
  "uploaded_document",
  "url",
  "imported",
]);

export const opportunityInterpretationStatus = pgEnum("opportunity_interpretation_status", [
  "uninterpreted",
  "extracted",
  "user_confirmed",
  "user_corrected",
]);

export const opportunitySourceContentStatus = pgEnum("opportunity_source_content_status", [
  "not_started",
  "pending",
  "available",
  "failed",
]);

export const requirementCategory = pgEnum("requirement_category", [
  "skill",
  "credential",
  "experience",
  "document",
  "format",
  "administrative_constraint",
  "other",
]);

export const requirementPriority = pgEnum("requirement_priority", ["required", "recommended"]);

/**
 * The external or user-described context against which an Application is evaluated.
 * Opportunity data is application context and is deliberately separate from the Dossier.
 */
export const opportunities = pgTable(
  "opportunities",
  {
    id: text("id").$defaultFn(() => randomUUID()).notNull().primaryKey(),
    applicationId: text("applicationId")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    title: text("title"),
    role: text("role"),
    organisation: text("organisation"),
    institution: text("institution"),
    location: text("location"),
    country: text("country"),
    sourceType: opportunitySourceType("sourceType").notNull().default("manual"),
    sourceReference: text("sourceReference"),
    deadline: timestamp("deadline", { mode: "date", withTimezone: true }),
    instructions: text("instructions"),
    context: text("context"),
    /** Bounded extracted text supplied by a user or a later extraction boundary. */
    extractedText: text("extractedText"),
    interpretationStatus: opportunityInterpretationStatus("interpretationStatus")
      .notNull()
      .default("uninterpreted"),
    interpretation: jsonb("interpretation").$type<Record<string, unknown> | null>(),
    interpretationVersion: text("interpretationVersion"),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => ({
    applicationUpdatedIndex: index("opportunities_applicationId_updatedAt_idx").on(
      table.applicationId,
      table.updatedAt,
    ),
  }),
);

/** Source metadata/provenance boundary. Raw files and extraction infrastructure are later concerns. */
export const opportunitySources = pgTable(
  "opportunity_sources",
  {
    id: text("id").$defaultFn(() => randomUUID()).notNull().primaryKey(),
    opportunityId: text("opportunityId")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    sourceType: opportunitySourceType("sourceType").notNull(),
    sourceReference: text("sourceReference"),
    contentFingerprint: text("contentFingerprint"),
    extractedContentStatus: opportunitySourceContentStatus("extractedContentStatus")
      .notNull()
      .default("not_started"),
    retainedUntil: timestamp("retainedUntil", { mode: "date", withTimezone: true }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => ({
    opportunityCreatedIndex: index("opportunity_sources_opportunityId_createdAt_idx").on(
      table.opportunityId,
      table.createdAt,
    ),
    fingerprintIndex: index("opportunity_sources_contentFingerprint_idx").on(
      table.contentFingerprint,
    ),
  }),
);

export const requirementInterpretationStatus = pgEnum("requirement_interpretation_status", [
  "uninterpreted",
  "extracted",
  "user_confirmed",
  "user_corrected",
  "matched",
  "satisfied",
  "partial",
  "gap",
  "waived",
]);

/** A structured ask from an Opportunity, never a claim about the user's Dossier. */
export const requirements = pgTable(
  "requirements",
  {
    id: text("id").$defaultFn(() => randomUUID()).notNull().primaryKey(),
    applicationId: text("applicationId")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    opportunityId: text("opportunityId").references(() => opportunities.id, { onDelete: "set null" }),
    text: text("text").notNull(),
    category: requirementCategory("category").notNull().default("other"),
    priority: requirementPriority("priority").notNull().default("required"),
    sourceId: text("sourceId").references(() => opportunitySources.id, { onDelete: "set null" }),
    sourceReference: text("sourceReference"),
    confidence: real("confidence"),
    interpretationStatus: requirementInterpretationStatus("interpretationStatus")
      .notNull()
      .default("uninterpreted"),
    normalizedInterpretation: text("normalizedInterpretation"),
    constraints: jsonb("constraints").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => ({
    applicationStatusIndex: index("requirements_applicationId_status_idx").on(
      table.applicationId,
      table.interpretationStatus,
    ),
    opportunityIndex: index("requirements_opportunityId_idx").on(table.opportunityId),
    sourceIndex: index("requirements_sourceId_idx").on(table.sourceId),
  }),
);

export type OpportunitySourceType = (typeof opportunitySourceType.enumValues)[number];
export type OpportunityInterpretationStatus =
  (typeof opportunityInterpretationStatus.enumValues)[number];
export type OpportunitySourceContentStatus = (typeof opportunitySourceContentStatus.enumValues)[number];
export type RequirementCategory = (typeof requirementCategory.enumValues)[number];
export type RequirementPriority = (typeof requirementPriority.enumValues)[number];
export type RequirementInterpretationStatus = (typeof requirementInterpretationStatus.enumValues)[number];
