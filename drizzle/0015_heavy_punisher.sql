CREATE TABLE "document_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"documentId" text NOT NULL,
	"userId" text NOT NULL,
	"applicationId" text NOT NULL,
	"version" integer NOT NULL,
	"sourceGeneratedContentVersionId" text NOT NULL,
	"sourceSpecificationId" text NOT NULL,
	"sourceSpecificationRevision" integer NOT NULL,
	"sourceSpecificationFingerprint" text NOT NULL,
	"sourceEvidenceFingerprint" text NOT NULL,
	"specification" jsonb NOT NULL,
	"selectedEvidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content" jsonb NOT NULL,
	"provenance" jsonb NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"contentFingerprint" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "document_versions_version_positive" CHECK ("document_versions"."version" > 0),
	CONSTRAINT "document_versions_specificationRevision_positive" CHECK ("document_versions"."sourceSpecificationRevision" > 0)
);
--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_documentId_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_applicationId_applications_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_sourceGeneratedContentVersionId_generated_content_versions_id_fk" FOREIGN KEY ("sourceGeneratedContentVersionId") REFERENCES "public"."generated_content_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_documentId_version_unique" ON "document_versions" USING btree ("documentId","version");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_sourceGeneratedContentVersionId_unique" ON "document_versions" USING btree ("sourceGeneratedContentVersionId");--> statement-breakpoint
CREATE INDEX "document_versions_documentId_createdAt_idx" ON "document_versions" USING btree ("documentId","createdAt");--> statement-breakpoint
CREATE INDEX "document_versions_userId_createdAt_idx" ON "document_versions" USING btree ("userId","createdAt");--> statement-breakpoint

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE public.document_versions FROM PUBLIC;--> statement-breakpoint
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.document_versions FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.reject_document_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Document Version history is append-only';
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.reject_document_version_mutation() FROM PUBLIC;--> statement-breakpoint
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION public.reject_document_version_mutation() FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;--> statement-breakpoint
CREATE TRIGGER document_versions_append_only
BEFORE UPDATE OR DELETE ON public.document_versions
FOR EACH ROW EXECUTE FUNCTION public.reject_document_version_mutation();