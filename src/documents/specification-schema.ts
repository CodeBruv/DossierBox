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
import { evidence } from "@/applications/planning-schema";
import { applicationPackageMembers } from "@/applications/planning-schema";
import { opportunities, requirements } from "@/applications/opportunity-schema";

const id = () => randomUUID();
const now = () => new Date();

/**
 * Review states are domain text rather than a PostgreSQL enum. Specification workflow can
 * evolve without making an additive business-state change into an enum migration, while the
 * database check still refuses values outside the currently supported lifecycle.
 */
export const documentSpecificationStatuses = [
  "draft",
  "ready_for_review",
  "approved",
  "superseded",
  "archived",
] as const;

export type DocumentSpecificationStatus = (typeof documentSpecificationStatuses)[number];

export type DocumentSpecificationConstraints = Record<string, unknown>;
export type DocumentSpecificationOutputCharacteristics = Record<string, unknown>;
export type DocumentSpecificationSectionExpectations = Record<string, unknown>;

/**
 * A revisioned statement of what one planned package document must accomplish.
 *
 * Package membership remains owned by `application_package_members`. The member also owns the
 * optional produced Document relationship, so this table deliberately has neither packageId nor
 * documentId. Application ownership is resolved through member → package → plan → application.
 * Requirement and Evidence records are referenced by the normalized tables below rather than
 * copied into this row.
 *
 * Nothing here is rendered content, a prompt, generated prose, style configuration, or layout.
 */
export const documentSpecifications = pgTable(
  "document_specifications",
  {
    id: text("id").$defaultFn(id).notNull().primaryKey(),
    packageMemberId: text("packageMemberId")
      .notNull()
      .references(() => applicationPackageMembers.id, { onDelete: "cascade" }),
    /** Catalogue key, checked by the repository and required to agree with the package member. */
    documentType: text("documentType").notNull(),
    /** Revision identity is scoped to the planned document, not to the whole package. */
    revision: integer("revision").notNull(),
    status: text("status").$type<DocumentSpecificationStatus>().notNull().default("draft"),
    purpose: text("purpose").notNull(),
    /** Optional because Applications and Requirements may legitimately exist without Opportunity. */
    opportunityId: text("opportunityId").references(() => opportunities.id, {
      onDelete: "set null",
    }),
    constraints: jsonb("constraints")
      .$type<DocumentSpecificationConstraints>()
      .notNull()
      .default({}),
    instructions: text("instructions"),
    context: text("context"),
    sectionExpectations: jsonb("sectionExpectations")
      .$type<DocumentSpecificationSectionExpectations>()
      .notNull()
      .default({}),
    outputCharacteristics: jsonb("outputCharacteristics")
      .$type<DocumentSpecificationOutputCharacteristics>()
      .notNull()
      .default({}),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .$defaultFn(now)
      .notNull(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .$defaultFn(now)
      .notNull(),
  },
  (table) => ({
    memberRevisionUnique: uniqueIndex(
      "document_specifications_packageMemberId_revision_unique",
    ).on(table.packageMemberId, table.revision),
    memberStatusIndex: index("document_specifications_packageMemberId_status_idx").on(
      table.packageMemberId,
      table.status,
    ),
    opportunityIndex: index("document_specifications_opportunityId_idx").on(table.opportunityId),
    positiveRevision: check(
      "document_specifications_revision_positive",
      sql`${table.revision} > 0`,
    ),
    knownStatus: check(
      "document_specifications_status_check",
      sql`${table.status} in ('draft', 'ready_for_review', 'approved', 'superseded', 'archived')`,
    ),
    nonBlankPurpose: check(
      "document_specifications_purpose_not_blank",
      sql`length(btrim(${table.purpose})) > 0`,
    ),
    nonBlankDocumentType: check(
      "document_specifications_documentType_not_blank",
      sql`length(btrim(${table.documentType})) > 0`,
    ),
  }),
);

/** Requirement provenance selected for a specification; no Requirement content is duplicated. */
export const documentSpecificationRequirements = pgTable(
  "document_specification_requirements",
  {
    specificationId: text("specificationId")
      .notNull()
      .references(() => documentSpecifications.id, { onDelete: "cascade" }),
    requirementId: text("requirementId")
      .notNull()
      .references(() => requirements.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .$defaultFn(now)
      .notNull(),
  },
  (table) => ({
    primaryKey: primaryKey({
      name: "document_specification_requirements_pk",
      columns: [table.specificationId, table.requirementId],
    }),
    requirementIndex: index("document_specification_requirements_requirementId_idx").on(
      table.requirementId,
    ),
  }),
);

/** Evidence provenance selected for a specification; no Dossier fact is copied or created. */
export const documentSpecificationEvidence = pgTable(
  "document_specification_evidence",
  {
    specificationId: text("specificationId")
      .notNull()
      .references(() => documentSpecifications.id, { onDelete: "cascade" }),
    evidenceId: text("evidenceId")
      .notNull()
      .references(() => evidence.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .$defaultFn(now)
      .notNull(),
  },
  (table) => ({
    primaryKey: primaryKey({
      name: "document_specification_evidence_pk",
      columns: [table.specificationId, table.evidenceId],
    }),
    evidenceIndex: index("document_specification_evidence_evidenceId_idx").on(table.evidenceId),
  }),
);
