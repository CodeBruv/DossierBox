CREATE TYPE "public"."auth_token_purpose" AS ENUM('email_verification', 'password_reset');--> statement-breakpoint
CREATE TABLE "auth_credentials" (
	"userId" text PRIMARY KEY NOT NULL,
	"passwordHash" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"limiterKey" text NOT NULL,
	"action" text NOT NULL,
	"windowStart" timestamp with time zone NOT NULL,
	"attemptCount" integer DEFAULT 0 NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_rate_limits_action_key_window_unique" UNIQUE("action","limiterKey","windowStart")
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"purpose" "auth_token_purpose" NOT NULL,
	"tokenHash" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"consumedAt" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_tokens_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
ALTER TABLE "auth_credentials" ADD CONSTRAINT "auth_credentials_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_rate_limits_action_key_idx" ON "auth_rate_limits" USING btree ("action","limiterKey");--> statement-breakpoint
CREATE INDEX "auth_rate_limits_expiresAt_idx" ON "auth_rate_limits" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "auth_tokens_tokenHash_idx" ON "auth_tokens" USING btree ("tokenHash");--> statement-breakpoint
CREATE INDEX "auth_tokens_userId_purpose_idx" ON "auth_tokens" USING btree ("userId","purpose");--> statement-breakpoint
CREATE INDEX "auth_tokens_expiresAt_idx" ON "auth_tokens" USING btree ("expiresAt");