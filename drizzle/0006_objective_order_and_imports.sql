-- Document objective, per-document section order, and the import review staging table.
--
-- `objective` is nullable because every document created before this migration was made
-- without one, and a document with no recorded purpose is still a valid document — the
-- facts come from the dossier, not from the objective.
--
-- `sectionOrder` defaults to the empty array, which the composition layer reads as "use
-- the document type's own order". Storing the empty case rather than a copy of the
-- catalogue order means a document does not freeze today's ordering: a type whose order
-- improves later improves for every document that never overrode it.
ALTER TABLE "documents" ADD COLUMN "objective" jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "sectionOrder" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
--
-- An uploaded career document, after reading and before the user confirms it.
--
-- Holds the *extracted candidates*, never the uploaded bytes: the file is read in the
-- request that received it and then discarded, so an abandoned import leaves no document
-- of the user's on disk. The row itself is deleted the moment the user finishes with it.
CREATE TABLE "documentImports" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"filename" text NOT NULL,
	"format" text NOT NULL,
	"result" jsonb NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documentImports" ADD CONSTRAINT "documentImports_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documentImports_userId_createdAt_idx" ON "documentImports" USING btree ("userId","createdAt");
