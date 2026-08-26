CREATE TYPE "public"."evidence_confirmation" AS ENUM('unreviewed', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."evidence_lifecycle" AS ENUM('active', 'unavailable', 'invalidated');--> statement-breakpoint
CREATE TYPE "public"."evidence_source_type" AS ENUM('identity', 'experience', 'education', 'projects', 'skills', 'credentials', 'achievements', 'languages', 'publications', 'memberships', 'links');--> statement-breakpoint
CREATE TYPE "public"."gap_status" AS ENUM('open', 'acknowledged', 'resolved', 'waived');--> statement-breakpoint
CREATE TYPE "public"."gap_type" AS ENUM('no_evidence', 'weak_evidence', 'ambiguous_evidence', 'confirmation_required', 'dossier_information_needed', 'administrative_requirement', 'document_format', 'other');--> statement-breakpoint
CREATE TYPE "public"."matching_review_state" AS ENUM('unreviewed', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."matching_status" AS ENUM('candidate', 'suggested', 'accepted', 'rejected', 'invalidated');--> statement-breakpoint
CREATE TYPE "public"."application_package_confirmation" AS ENUM('unconfirmed', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."application_package_member_availability" AS ENUM('available', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."application_package_member_completion" AS ENUM('planned', 'in_progress', 'complete');--> statement-breakpoint
CREATE TYPE "public"."application_package_member_role" AS ENUM('primary', 'supporting');--> statement-breakpoint
CREATE TYPE "public"."application_package_member_specification_status" AS ENUM('not_started', 'placeholder');--> statement-breakpoint
CREATE TYPE "public"."application_package_status" AS ENUM('draft', 'confirmed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."application_plan_confirmation" AS ENUM('unconfirmed', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."application_plan_resolution_source" AS ENUM('deterministic', 'user_adjusted');--> statement-breakpoint
CREATE TYPE "public"."application_plan_status" AS ENUM('draft', 'proposed', 'confirmed', 'archived');--> statement-breakpoint
CREATE TABLE "application_package_members" (
	"id" text PRIMARY KEY NOT NULL,
	"packageId" text NOT NULL,
	"documentType" text NOT NULL,
	"role" "application_package_member_role" NOT NULL,
	"position" integer NOT NULL,
	"availability" "application_package_member_availability" NOT NULL,
	"specificationStatus" "application_package_member_specification_status" DEFAULT 'not_started' NOT NULL,
	"completion" "application_package_member_completion" DEFAULT 'planned' NOT NULL,
	"documentId" text,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_packages" (
	"id" text PRIMARY KEY NOT NULL,
	"planId" text NOT NULL,
	"status" "application_package_status" DEFAULT 'draft' NOT NULL,
	"confirmation" "application_package_confirmation" DEFAULT 'unconfirmed' NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"version" integer NOT NULL,
	"status" "application_plan_status" DEFAULT 'draft' NOT NULL,
	"resolutionSource" "application_plan_resolution_source" DEFAULT 'deterministic' NOT NULL,
	"confirmation" "application_plan_confirmation" DEFAULT 'unconfirmed' NOT NULL,
	"recommendedDocuments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requirementCoverage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidenceCoverage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"gapsSummary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"sourceType" "evidence_source_type" NOT NULL,
	"sourceRecordId" text NOT NULL,
	"excerpt" text,
	"provenance" jsonb,
	"lifecycle" "evidence_lifecycle" DEFAULT 'active' NOT NULL,
	"confirmation" "evidence_confirmation" DEFAULT 'unreviewed' NOT NULL,
	"relevance" real,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_gaps" (
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"requirementId" text,
	"type" "gap_type" NOT NULL,
	"description" text NOT NULL,
	"status" "gap_status" DEFAULT 'open' NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matching_results" (
	"id" text PRIMARY KEY NOT NULL,
	"requirementId" text NOT NULL,
	"evidenceId" text NOT NULL,
	"status" "matching_status" DEFAULT 'candidate' NOT NULL,
	"strength" real,
	"explanation" text,
	"provenance" jsonb,
	"reviewState" "matching_review_state" DEFAULT 'unreviewed' NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_package_members" ADD CONSTRAINT "application_package_members_packageId_application_packages_id_fk" FOREIGN KEY ("packageId") REFERENCES "public"."application_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_package_members" ADD CONSTRAINT "application_package_members_documentId_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_packages" ADD CONSTRAINT "application_packages_planId_application_plans_id_fk" FOREIGN KEY ("planId") REFERENCES "public"."application_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_plans" ADD CONSTRAINT "application_plans_applicationId_applications_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_evidence" ADD CONSTRAINT "application_evidence_applicationId_applications_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_gaps" ADD CONSTRAINT "application_gaps_applicationId_applications_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_gaps" ADD CONSTRAINT "application_gaps_requirementId_requirements_id_fk" FOREIGN KEY ("requirementId") REFERENCES "public"."requirements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matching_results" ADD CONSTRAINT "matching_results_requirementId_requirements_id_fk" FOREIGN KEY ("requirementId") REFERENCES "public"."requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matching_results" ADD CONSTRAINT "matching_results_evidenceId_application_evidence_id_fk" FOREIGN KEY ("evidenceId") REFERENCES "public"."application_evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_package_members_packageId_position_idx" ON "application_package_members" USING btree ("packageId","position");--> statement-breakpoint
CREATE INDEX "application_plans_applicationId_version_idx" ON "application_plans" USING btree ("applicationId","version");--> statement-breakpoint
CREATE INDEX "application_evidence_applicationId_idx" ON "application_evidence" USING btree ("applicationId");--> statement-breakpoint
CREATE INDEX "application_gaps_applicationId_status_idx" ON "application_gaps" USING btree ("applicationId","status");--> statement-breakpoint
CREATE INDEX "matching_results_requirementId_idx" ON "matching_results" USING btree ("requirementId");--> statement-breakpoint
CREATE INDEX "matching_results_evidenceId_idx" ON "matching_results" USING btree ("evidenceId");