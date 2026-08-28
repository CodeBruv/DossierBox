CREATE TABLE "generated_content_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"attemptId" text NOT NULL,
	"version" integer NOT NULL,
	"documentType" text NOT NULL,
	"content" jsonb NOT NULL,
	"provenance" jsonb NOT NULL,
	"contentFingerprint" text NOT NULL,
	"compilerFingerprint" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "generated_content_versions_version_positive" CHECK ("generated_content_versions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "generation_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"applicationId" text NOT NULL,
	"specificationId" text NOT NULL,
	"specificationRevision" integer NOT NULL,
	"specificationFingerprint" text NOT NULL,
	"evidenceFingerprint" text NOT NULL,
	"requestFingerprint" text NOT NULL,
	"idempotencyKey" text NOT NULL,
	"entitlementPlan" text NOT NULL,
	"estimatedUnits" integer NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"failureKind" text,
	"failureDetail" jsonb,
	"createdAt" timestamp with time zone NOT NULL,
	"completedAt" timestamp with time zone,
	CONSTRAINT "generation_attempts_specificationRevision_positive" CHECK ("generation_attempts"."specificationRevision" > 0),
	CONSTRAINT "generation_attempts_estimatedUnits_non_negative" CHECK ("generation_attempts"."estimatedUnits" >= 0),
	CONSTRAINT "generation_attempts_status_check" CHECK ("generation_attempts"."status" in ('created', 'reserved', 'running', 'succeeded', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "generation_evidence_manifest_items" (
	"attemptId" text NOT NULL,
	"evidenceId" text NOT NULL,
	"applicationId" text NOT NULL,
	"sourceType" text NOT NULL,
	"sourceRecordId" text NOT NULL,
	"evidenceFingerprint" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "generation_evidence_manifest_items_attemptId_evidenceId_pk" PRIMARY KEY("attemptId","evidenceId")
);
--> statement-breakpoint
CREATE TABLE "generation_validations" (
	"id" text PRIMARY KEY NOT NULL,
	"attemptId" text NOT NULL,
	"workItemId" text,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"fingerprint" text NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "generation_validations_kind_check" CHECK ("generation_validations"."kind" in ('provider', 'response', 'normalization', 'integrity', 'provenance', 'compiler', 'required_sections')),
	CONSTRAINT "generation_validations_status_check" CHECK ("generation_validations"."status" in ('passed', 'failed', 'warning'))
);
--> statement-breakpoint
CREATE TABLE "generation_work_items" (
	"id" text PRIMARY KEY NOT NULL,
	"attemptId" text NOT NULL,
	"sectionKey" text NOT NULL,
	"heading" text NOT NULL,
	"layout" text NOT NULL,
	"workOrder" integer NOT NULL,
	"workload" text NOT NULL,
	"evidenceManifest" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contextFingerprint" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"completedAt" timestamp with time zone,
	CONSTRAINT "generation_work_items_workOrder_non_negative" CHECK ("generation_work_items"."workOrder" >= 0),
	CONSTRAINT "generation_work_items_status_check" CHECK ("generation_work_items"."status" in ('pending', 'running', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "iu_accounts" (
	"userId" text PRIMARY KEY NOT NULL,
	"availableUnits" integer DEFAULT 0 NOT NULL,
	"reservedUnits" integer DEFAULT 0 NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "iu_accounts_availableUnits_non_negative" CHECK ("iu_accounts"."availableUnits" >= 0),
	CONSTRAINT "iu_accounts_reservedUnits_non_negative" CHECK ("iu_accounts"."reservedUnits" >= 0)
);
--> statement-breakpoint
CREATE TABLE "iu_ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"attemptId" text NOT NULL,
	"kind" text NOT NULL,
	"units" integer NOT NULL,
	"entitlementPlan" text NOT NULL,
	"reason" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "iu_ledger_entries_units_positive" CHECK ("iu_ledger_entries"."units" > 0),
	CONSTRAINT "iu_ledger_entries_kind_check" CHECK ("iu_ledger_entries"."kind" in ('reservation', 'allocation', 'release', 'refund', 'compensation'))
);
--> statement-breakpoint
CREATE TABLE "generation_provider_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"attemptId" text NOT NULL,
	"workItemId" text NOT NULL,
	"sequence" integer NOT NULL,
	"promptId" text NOT NULL,
	"requestFingerprint" text NOT NULL,
	"provider" text,
	"model" text,
	"status" text NOT NULL,
	"inputTokens" integer,
	"outputTokens" integer,
	"currency" text,
	"amountMinor" integer,
	"failure" text,
	"startedAt" timestamp with time zone NOT NULL,
	"completedAt" timestamp with time zone,
	CONSTRAINT "generation_provider_executions_sequence_positive" CHECK ("generation_provider_executions"."sequence" > 0),
	CONSTRAINT "generation_provider_executions_amountMinor_non_negative" CHECK ("generation_provider_executions"."amountMinor" is null or "generation_provider_executions"."amountMinor" >= 0),
	CONSTRAINT "generation_provider_executions_status_check" CHECK ("generation_provider_executions"."status" in ('succeeded', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "generated_content_versions" ADD CONSTRAINT "generated_content_versions_attemptId_generation_attempts_id_fk" FOREIGN KEY ("attemptId") REFERENCES "public"."generation_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_applicationId_applications_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_specificationId_document_specifications_id_fk" FOREIGN KEY ("specificationId") REFERENCES "public"."document_specifications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_evidence_manifest_items" ADD CONSTRAINT "generation_evidence_manifest_items_attemptId_generation_attempts_id_fk" FOREIGN KEY ("attemptId") REFERENCES "public"."generation_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_validations" ADD CONSTRAINT "generation_validations_attemptId_generation_attempts_id_fk" FOREIGN KEY ("attemptId") REFERENCES "public"."generation_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_validations" ADD CONSTRAINT "generation_validations_workItemId_generation_work_items_id_fk" FOREIGN KEY ("workItemId") REFERENCES "public"."generation_work_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_work_items" ADD CONSTRAINT "generation_work_items_attemptId_generation_attempts_id_fk" FOREIGN KEY ("attemptId") REFERENCES "public"."generation_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iu_accounts" ADD CONSTRAINT "iu_accounts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iu_ledger_entries" ADD CONSTRAINT "iu_ledger_entries_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iu_ledger_entries" ADD CONSTRAINT "iu_ledger_entries_attemptId_generation_attempts_id_fk" FOREIGN KEY ("attemptId") REFERENCES "public"."generation_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_provider_executions" ADD CONSTRAINT "generation_provider_executions_attemptId_generation_attempts_id_fk" FOREIGN KEY ("attemptId") REFERENCES "public"."generation_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_provider_executions" ADD CONSTRAINT "generation_provider_executions_workItemId_generation_work_items_id_fk" FOREIGN KEY ("workItemId") REFERENCES "public"."generation_work_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "generated_content_versions_attemptId_version_unique" ON "generated_content_versions" USING btree ("attemptId","version");--> statement-breakpoint
CREATE INDEX "generated_content_versions_attemptId_createdAt_idx" ON "generated_content_versions" USING btree ("attemptId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_attempts_userId_idempotencyKey_unique" ON "generation_attempts" USING btree ("userId","idempotencyKey");--> statement-breakpoint
CREATE INDEX "generation_attempts_userId_requestFingerprint_idx" ON "generation_attempts" USING btree ("userId","requestFingerprint");--> statement-breakpoint
CREATE INDEX "generation_attempts_userId_status_createdAt_idx" ON "generation_attempts" USING btree ("userId","status","createdAt");--> statement-breakpoint
CREATE INDEX "generation_evidence_manifest_items_evidenceId_idx" ON "generation_evidence_manifest_items" USING btree ("evidenceId");--> statement-breakpoint
CREATE INDEX "generation_validations_attemptId_createdAt_idx" ON "generation_validations" USING btree ("attemptId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_work_items_attemptId_workOrder_unique" ON "generation_work_items" USING btree ("attemptId","workOrder");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_work_items_attemptId_sectionKey_unique" ON "generation_work_items" USING btree ("attemptId","sectionKey");--> statement-breakpoint
CREATE INDEX "generation_work_items_attemptId_status_idx" ON "generation_work_items" USING btree ("attemptId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "iu_ledger_entries_attemptId_kind_unique" ON "iu_ledger_entries" USING btree ("attemptId","kind");--> statement-breakpoint
CREATE INDEX "iu_ledger_entries_userId_createdAt_idx" ON "iu_ledger_entries" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_provider_executions_workItemId_sequence_unique" ON "generation_provider_executions" USING btree ("workItemId","sequence");--> statement-breakpoint
CREATE INDEX "generation_provider_executions_attemptId_idx" ON "generation_provider_executions" USING btree ("attemptId");--> statement-breakpoint

-- Preserve the deny-by-default public API boundary for Generation persistence.
ALTER TABLE public.generated_content_versions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.generation_attempts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.generation_evidence_manifest_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.generation_validations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.generation_work_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.iu_accounts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.iu_ledger_entries ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.generation_provider_executions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.generated_content_versions, public.generation_attempts, public.generation_evidence_manifest_items, public.generation_validations, public.generation_work_items, public.iu_accounts, public.iu_ledger_entries, public.generation_provider_executions FROM %I',
        api_role
      );
    END IF;
  END LOOP;
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.reject_generation_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Generation history is append-only';
END;
$$;--> statement-breakpoint

CREATE TRIGGER generated_content_versions_append_only
BEFORE UPDATE OR DELETE ON public.generated_content_versions
FOR EACH ROW EXECUTE FUNCTION public.reject_generation_history_mutation();--> statement-breakpoint
CREATE TRIGGER generation_evidence_manifest_items_append_only
BEFORE UPDATE OR DELETE ON public.generation_evidence_manifest_items
FOR EACH ROW EXECUTE FUNCTION public.reject_generation_history_mutation();--> statement-breakpoint
CREATE TRIGGER generation_validations_append_only
BEFORE UPDATE OR DELETE ON public.generation_validations
FOR EACH ROW EXECUTE FUNCTION public.reject_generation_history_mutation();--> statement-breakpoint
CREATE TRIGGER iu_ledger_entries_append_only
BEFORE UPDATE OR DELETE ON public.iu_ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.reject_generation_history_mutation();--> statement-breakpoint
CREATE TRIGGER generation_provider_executions_append_only
BEFORE UPDATE OR DELETE ON public.generation_provider_executions
FOR EACH ROW EXECUTE FUNCTION public.reject_generation_history_mutation();