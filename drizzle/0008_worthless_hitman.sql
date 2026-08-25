CREATE TYPE "public"."opportunity_interpretation_status" AS ENUM('uninterpreted', 'extracted', 'user_confirmed', 'user_corrected');--> statement-breakpoint
CREATE TYPE "public"."opportunity_source_content_status" AS ENUM('not_started', 'pending', 'available', 'failed');--> statement-breakpoint
CREATE TYPE "public"."opportunity_source_type" AS ENUM('manual', 'pasted_text', 'uploaded_document', 'url', 'imported');--> statement-breakpoint
CREATE TYPE "public"."requirement_category" AS ENUM('skill', 'credential', 'experience', 'document', 'format', 'administrative_constraint', 'other');--> statement-breakpoint
CREATE TYPE "public"."requirement_interpretation_status" AS ENUM('uninterpreted', 'extracted', 'user_confirmed', 'user_corrected', 'matched', 'satisfied', 'partial', 'gap', 'waived');--> statement-breakpoint
CREATE TYPE "public"."requirement_priority" AS ENUM('required', 'recommended');--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"title" text,
	"role" text,
	"organisation" text,
	"institution" text,
	"location" text,
	"country" text,
	"sourceType" "opportunity_source_type" DEFAULT 'manual' NOT NULL,
	"sourceReference" text,
	"deadline" timestamp with time zone,
	"instructions" text,
	"context" text,
	"extractedText" text,
	"interpretationStatus" "opportunity_interpretation_status" DEFAULT 'uninterpreted' NOT NULL,
	"interpretation" jsonb,
	"interpretationVersion" text,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"opportunityId" text NOT NULL,
	"sourceType" "opportunity_source_type" NOT NULL,
	"sourceReference" text,
	"contentFingerprint" text,
	"extractedContentStatus" "opportunity_source_content_status" DEFAULT 'not_started' NOT NULL,
	"retainedUntil" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirements" (
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"opportunityId" text,
	"text" text NOT NULL,
	"category" "requirement_category" DEFAULT 'other' NOT NULL,
	"priority" "requirement_priority" DEFAULT 'required' NOT NULL,
	"sourceId" text,
	"sourceReference" text,
	"confidence" real,
	"interpretationStatus" "requirement_interpretation_status" DEFAULT 'uninterpreted' NOT NULL,
	"normalizedInterpretation" text,
	"constraints" jsonb,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_applicationId_applications_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_sources" ADD CONSTRAINT "opportunity_sources_opportunityId_opportunities_id_fk" FOREIGN KEY ("opportunityId") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_applicationId_applications_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_opportunityId_opportunities_id_fk" FOREIGN KEY ("opportunityId") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_sourceId_opportunity_sources_id_fk" FOREIGN KEY ("sourceId") REFERENCES "public"."opportunity_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opportunities_applicationId_updatedAt_idx" ON "opportunities" USING btree ("applicationId","updatedAt");--> statement-breakpoint
CREATE INDEX "opportunity_sources_opportunityId_createdAt_idx" ON "opportunity_sources" USING btree ("opportunityId","createdAt");--> statement-breakpoint
CREATE INDEX "opportunity_sources_contentFingerprint_idx" ON "opportunity_sources" USING btree ("contentFingerprint");--> statement-breakpoint
CREATE INDEX "requirements_applicationId_status_idx" ON "requirements" USING btree ("applicationId","interpretationStatus");--> statement-breakpoint
CREATE INDEX "requirements_opportunityId_idx" ON "requirements" USING btree ("opportunityId");--> statement-breakpoint
CREATE INDEX "requirements_sourceId_idx" ON "requirements" USING btree ("sourceId");