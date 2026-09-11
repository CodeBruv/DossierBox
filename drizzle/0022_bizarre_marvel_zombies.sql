ALTER TABLE "documents" ADD COLUMN "pageBreaks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "contentOverrides" jsonb DEFAULT '{}'::jsonb NOT NULL;