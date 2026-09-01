CREATE TYPE "public"."evidence_selection_status" AS ENUM('confirmed', 'rejected', 'stale', 'invalidated');--> statement-breakpoint
CREATE TABLE "application_evidence_selections" (
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"packageId" text NOT NULL,
	"requirementId" text NOT NULL,
	"evidenceId" text NOT NULL,
	"status" "evidence_selection_status" NOT NULL,
	"confirmedAt" timestamp with time zone,
	"confirmedByUserId" text,
	"requirementFingerprint" text NOT NULL,
	"evidenceFingerprint" text NOT NULL,
	"matchingResultId" text,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_evidence_selections" ADD CONSTRAINT "application_evidence_selections_applicationId_applications_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_evidence_selections" ADD CONSTRAINT "application_evidence_selections_packageId_application_packages_id_fk" FOREIGN KEY ("packageId") REFERENCES "public"."application_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_evidence_selections" ADD CONSTRAINT "application_evidence_selections_requirementId_requirements_id_fk" FOREIGN KEY ("requirementId") REFERENCES "public"."requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_evidence_selections" ADD CONSTRAINT "application_evidence_selections_evidenceId_application_evidence_id_fk" FOREIGN KEY ("evidenceId") REFERENCES "public"."application_evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_evidence_selections" ADD CONSTRAINT "application_evidence_selections_confirmedByUserId_users_id_fk" FOREIGN KEY ("confirmedByUserId") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_evidence_selections" ADD CONSTRAINT "application_evidence_selections_matchingResultId_matching_results_id_fk" FOREIGN KEY ("matchingResultId") REFERENCES "public"."matching_results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_evidence_selections_package_requirement_evidence_unique" ON "application_evidence_selections" USING btree ("packageId","requirementId","evidenceId");--> statement-breakpoint
CREATE INDEX "application_evidence_selections_packageId_status_idx" ON "application_evidence_selections" USING btree ("packageId","status");--> statement-breakpoint
CREATE INDEX "application_evidence_selections_requirementId_status_idx" ON "application_evidence_selections" USING btree ("requirementId","status");--> statement-breakpoint
CREATE INDEX "application_evidence_selections_evidenceId_status_idx" ON "application_evidence_selections" USING btree ("evidenceId","status");--> statement-breakpoint
ALTER TABLE "application_evidence_selections" ADD CONSTRAINT "application_evidence_selections_confirmation_check" CHECK (("status" = 'confirmed' AND "confirmedAt" IS NOT NULL AND "confirmedByUserId" IS NOT NULL) OR ("status" <> 'confirmed' AND "confirmedAt" IS NULL AND "confirmedByUserId" IS NULL));--> statement-breakpoint
ALTER TABLE public.application_evidence_selections ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.application_evidence_selections FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;