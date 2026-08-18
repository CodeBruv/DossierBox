CREATE TYPE "public"."document_status" AS ENUM('draft');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('professional_cv', 'professional_resume', 'academic_cv');--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"type" "document_type" NOT NULL,
	"title" text NOT NULL,
	"status" "document_status" DEFAULT 'draft' NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_userId_updatedAt_idx" ON "documents" USING btree ("userId","updatedAt");