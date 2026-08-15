CREATE TABLE "profileAchievements" (
	"id" text PRIMARY KEY NOT NULL,
	"profileId" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"issuer" text,
	"month" integer,
	"year" integer,
	"description" text,
	"experienceId" text,
	"projectId" text,
	"position" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profileCredentials" (
	"id" text PRIMARY KEY NOT NULL,
	"profileId" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"issuer" text,
	"identifier" text,
	"url" text,
	"issueMonth" integer,
	"issueYear" integer,
	"expiryMonth" integer,
	"expiryYear" integer,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profileEducation" (
	"id" text PRIMARY KEY NOT NULL,
	"profileId" text NOT NULL,
	"institution" text NOT NULL,
	"qualification" text,
	"field" text,
	"location" text,
	"startMonth" integer,
	"startYear" integer,
	"endMonth" integer,
	"endYear" integer,
	"current" boolean DEFAULT false NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profileExperiences" (
	"id" text PRIMARY KEY NOT NULL,
	"profileId" text NOT NULL,
	"type" text NOT NULL,
	"organization" text NOT NULL,
	"role" text NOT NULL,
	"location" text,
	"startMonth" integer,
	"startYear" integer,
	"endMonth" integer,
	"endYear" integer,
	"current" boolean DEFAULT false NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profileLanguages" (
	"id" text PRIMARY KEY NOT NULL,
	"profileId" text NOT NULL,
	"language" text NOT NULL,
	"proficiency" text,
	"notes" text,
	"position" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profileMemberships" (
	"id" text PRIMARY KEY NOT NULL,
	"profileId" text NOT NULL,
	"organization" text NOT NULL,
	"role" text,
	"startMonth" integer,
	"startYear" integer,
	"endMonth" integer,
	"endYear" integer,
	"current" boolean DEFAULT false NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profileLinks" (
	"id" text PRIMARY KEY NOT NULL,
	"profileId" text NOT NULL,
	"type" text NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profileSections" (
	"profileId" text NOT NULL,
	"section" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "profileSections_profileId_section_pk" PRIMARY KEY("profileId","section")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"displayName" text,
	"contactEmail" text,
	"phone" text,
	"country" text,
	"region" text,
	"city" text,
	"website" text,
	"headline" text,
	"careerDirection" text,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "profiles_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "profileProjects" (
	"id" text PRIMARY KEY NOT NULL,
	"profileId" text NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"context" text,
	"url" text,
	"startMonth" integer,
	"startYear" integer,
	"endMonth" integer,
	"endYear" integer,
	"current" boolean DEFAULT false NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profilePublications" (
	"id" text PRIMARY KEY NOT NULL,
	"profileId" text NOT NULL,
	"title" text NOT NULL,
	"publisher" text,
	"month" integer,
	"year" integer,
	"url" text,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profileSkills" (
	"id" text PRIMARY KEY NOT NULL,
	"profileId" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"notes" text,
	"position" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profileAchievements" ADD CONSTRAINT "profileAchievements_profileId_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profileAchievements" ADD CONSTRAINT "profileAchievements_experienceId_profileExperiences_id_fk" FOREIGN KEY ("experienceId") REFERENCES "public"."profileExperiences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profileAchievements" ADD CONSTRAINT "profileAchievements_projectId_profileProjects_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."profileProjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profileCredentials" ADD CONSTRAINT "profileCredentials_profileId_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profileEducation" ADD CONSTRAINT "profileEducation_profileId_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profileExperiences" ADD CONSTRAINT "profileExperiences_profileId_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profileLanguages" ADD CONSTRAINT "profileLanguages_profileId_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profileMemberships" ADD CONSTRAINT "profileMemberships_profileId_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profileLinks" ADD CONSTRAINT "profileLinks_profileId_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profileSections" ADD CONSTRAINT "profileSections_profileId_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profileProjects" ADD CONSTRAINT "profileProjects_profileId_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profilePublications" ADD CONSTRAINT "profilePublications_profileId_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profileSkills" ADD CONSTRAINT "profileSkills_profileId_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;