ALTER TABLE "documents" ADD COLUMN "pageBreaks" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "documents" ADD COLUMN "contentOverrides" jsonb DEFAULT '{}'::jsonb NOT NULL;
