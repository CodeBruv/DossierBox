-- Education: level of study, grading system and grade.
--
-- Additive and nullable, so it applies to a populated table without touching a single
-- existing row. Every column is text rather than an enum: no fixed vocabulary covers
-- qualification frameworks worldwide, and the application offers curated options while
-- still accepting what the user names.
ALTER TABLE "profileEducation" ADD COLUMN "level" text;--> statement-breakpoint
ALTER TABLE "profileEducation" ADD COLUMN "gradingSystem" text;--> statement-breakpoint
ALTER TABLE "profileEducation" ADD COLUMN "grade" text;
