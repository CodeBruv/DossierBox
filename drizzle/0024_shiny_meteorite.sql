ALTER TABLE "documents" ADD COLUMN "typographyFamily" text DEFAULT 'open-sans' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "typographySize" text DEFAULT '11' NOT NULL;