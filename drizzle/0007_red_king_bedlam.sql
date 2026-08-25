CREATE TYPE "public"."application_status" AS ENUM('draft', 'archived');--> statement-breakpoint
CREATE TABLE "application_intents" (
	"applicationId" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"targetRole" text,
	"organisation" text,
	"institution" text,
	"programme" text,
	"field" text,
	"country" text,
	"deadline" text,
	"requirements" text,
	"instructions" text,
	"wordLimit" integer,
	"pageLimit" integer,
	"requestedDocuments" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"status" "application_status" DEFAULT 'draft' NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "applicationId" text;--> statement-breakpoint
ALTER TABLE "application_intents" ADD CONSTRAINT "application_intents_applicationId_applications_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_userId_updatedAt_idx" ON "applications" USING btree ("userId","updatedAt");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_applicationId_applications_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_applicationId_idx" ON "documents" USING btree ("applicationId");