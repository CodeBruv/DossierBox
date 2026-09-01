ALTER TABLE "generation_attempts" DROP CONSTRAINT "generation_attempts_specificationRevision_positive";--> statement-breakpoint
DROP INDEX "generation_provider_executions_workItemId_sequence_unique";--> statement-breakpoint
ALTER TABLE "generation_attempts" ALTER COLUMN "specificationId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_attempts" ALTER COLUMN "specificationRevision" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_attempts" ALTER COLUMN "specificationFingerprint" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_attempts" ALTER COLUMN "evidenceFingerprint" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_provider_executions" ALTER COLUMN "workItemId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD COLUMN "operationKind" text DEFAULT 'document_generation' NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD COLUMN "opportunityId" text;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD COLUMN "opportunitySourceId" text;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD COLUMN "sourceFingerprint" text;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD COLUMN "contractVersion" text;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_opportunityId_opportunities_id_fk" FOREIGN KEY ("opportunityId") REFERENCES "public"."opportunities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_opportunitySourceId_opportunity_sources_id_fk" FOREIGN KEY ("opportunitySourceId") REFERENCES "public"."opportunity_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_attempts_interpretation_identity_idx" ON "generation_attempts" USING btree ("userId","opportunitySourceId","sourceFingerprint","contractVersion","status");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_provider_executions_attemptId_sequence_without_workItem_unique" ON "generation_provider_executions" USING btree ("attemptId","sequence") WHERE "generation_provider_executions"."workItemId" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "generation_provider_executions_workItemId_sequence_unique" ON "generation_provider_executions" USING btree ("workItemId","sequence") WHERE "generation_provider_executions"."workItemId" is not null;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_operationKind_check" CHECK ("generation_attempts"."operationKind" in ('document_generation', 'opportunity_interpretation'));--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_operation_target_check" CHECK ((
        "generation_attempts"."operationKind" = 'document_generation'
        and "generation_attempts"."specificationId" is not null
        and "generation_attempts"."specificationRevision" is not null
        and "generation_attempts"."specificationFingerprint" is not null
        and "generation_attempts"."evidenceFingerprint" is not null
        and "generation_attempts"."opportunityId" is null
        and "generation_attempts"."opportunitySourceId" is null
        and "generation_attempts"."sourceFingerprint" is null
        and "generation_attempts"."contractVersion" is null
      ) or (
        "generation_attempts"."operationKind" = 'opportunity_interpretation'
        and "generation_attempts"."specificationId" is null
        and "generation_attempts"."specificationRevision" is null
        and "generation_attempts"."specificationFingerprint" is null
        and "generation_attempts"."evidenceFingerprint" is null
        and "generation_attempts"."opportunityId" is not null
        and "generation_attempts"."opportunitySourceId" is not null
        and "generation_attempts"."sourceFingerprint" is not null
        and "generation_attempts"."contractVersion" is not null
      ));--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_specificationRevision_positive" CHECK ("generation_attempts"."specificationRevision" is null or "generation_attempts"."specificationRevision" > 0);