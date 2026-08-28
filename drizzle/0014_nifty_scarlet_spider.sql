ALTER TABLE "generation_attempts" ADD COLUMN "endpoint" text;--> statement-breakpoint
UPDATE "generation_attempts" SET "endpoint" = 'document-generation' WHERE "endpoint" IS NULL;--> statement-breakpoint
ALTER TABLE "generation_attempts" ALTER COLUMN "endpoint" SET NOT NULL;--> statement-breakpoint
DROP INDEX "generation_attempts_userId_idempotencyKey_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "generation_attempts_userId_endpoint_idempotencyKey_unique" ON "generation_attempts" USING btree ("userId","endpoint","idempotencyKey");--> statement-breakpoint

-- Trigger functions are internal implementation details, not public API routines.
REVOKE ALL ON FUNCTION public.reject_generation_history_mutation() FROM PUBLIC;--> statement-breakpoint
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON FUNCTION public.reject_generation_history_mutation() FROM %I',
        api_role
      );
    END IF;
  END LOOP;
END
$$;