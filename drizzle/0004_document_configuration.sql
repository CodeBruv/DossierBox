ALTER TABLE "documents" ADD COLUMN "template" text DEFAULT 'classic' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "hiddenSections" jsonb DEFAULT '[]'::jsonb NOT NULL;
