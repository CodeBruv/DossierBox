CREATE TABLE "document_specification_evidence" (
	"specificationId" text NOT NULL,
	"evidenceId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "document_specification_evidence_pk" PRIMARY KEY("specificationId","evidenceId")
);
--> statement-breakpoint
CREATE TABLE "document_specification_requirements" (
	"specificationId" text NOT NULL,
	"requirementId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "document_specification_requirements_pk" PRIMARY KEY("specificationId","requirementId")
);
--> statement-breakpoint
CREATE TABLE "document_specifications" (
	"id" text PRIMARY KEY NOT NULL,
	"packageMemberId" text NOT NULL,
	"documentType" text NOT NULL,
	"revision" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"purpose" text NOT NULL,
	"opportunityId" text,
	"constraints" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"instructions" text,
	"context" text,
	"sectionExpectations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"outputCharacteristics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "document_specifications_revision_positive" CHECK ("document_specifications"."revision" > 0),
	CONSTRAINT "document_specifications_status_check" CHECK ("document_specifications"."status" in ('draft', 'ready_for_review', 'approved', 'superseded', 'archived')),
	CONSTRAINT "document_specifications_purpose_not_blank" CHECK (length(btrim("document_specifications"."purpose")) > 0),
	CONSTRAINT "document_specifications_documentType_not_blank" CHECK (length(btrim("document_specifications"."documentType")) > 0)
);
--> statement-breakpoint
ALTER TABLE "document_specification_evidence" ADD CONSTRAINT "document_specification_evidence_specificationId_document_specifications_id_fk" FOREIGN KEY ("specificationId") REFERENCES "public"."document_specifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_specification_evidence" ADD CONSTRAINT "document_specification_evidence_evidenceId_application_evidence_id_fk" FOREIGN KEY ("evidenceId") REFERENCES "public"."application_evidence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_specification_requirements" ADD CONSTRAINT "document_specification_requirements_specificationId_document_specifications_id_fk" FOREIGN KEY ("specificationId") REFERENCES "public"."document_specifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_specification_requirements" ADD CONSTRAINT "document_specification_requirements_requirementId_requirements_id_fk" FOREIGN KEY ("requirementId") REFERENCES "public"."requirements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_specifications" ADD CONSTRAINT "document_specifications_packageMemberId_application_package_members_id_fk" FOREIGN KEY ("packageMemberId") REFERENCES "public"."application_package_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_specifications" ADD CONSTRAINT "document_specifications_opportunityId_opportunities_id_fk" FOREIGN KEY ("opportunityId") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_specification_evidence_evidenceId_idx" ON "document_specification_evidence" USING btree ("evidenceId");--> statement-breakpoint
CREATE INDEX "document_specification_requirements_requirementId_idx" ON "document_specification_requirements" USING btree ("requirementId");--> statement-breakpoint
CREATE UNIQUE INDEX "document_specifications_packageMemberId_revision_unique" ON "document_specifications" USING btree ("packageMemberId","revision");--> statement-breakpoint
CREATE INDEX "document_specifications_packageMemberId_status_idx" ON "document_specifications" USING btree ("packageMemberId","status");--> statement-breakpoint
CREATE INDEX "document_specifications_opportunityId_idx" ON "document_specifications" USING btree ("opportunityId");--> statement-breakpoint

-- Preserve the deny-by-default public API boundary for tables added after the baseline security migration.
ALTER TABLE public.document_specification_evidence ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.document_specification_requirements ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.document_specifications ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.document_specification_evidence, public.document_specification_requirements, public.document_specifications FROM %I',
        api_role
      );
    END IF;
  END LOOP;
END
$$;