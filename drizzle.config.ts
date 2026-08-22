import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/auth/schema.ts", "./src/profile/schema.ts", "./src/documents/schema.ts"],
  out: "./drizzle",
  dbCredentials: {
    /**
     * Migrations issue DDL, so they want a session-mode connection rather than
     * the transaction pooler the application runs on. DATABASE_DIRECT_URL is
     * preferred when set; DATABASE_URL remains the fallback for environments
     * where both are the same connection.
     */
    url:
      process.env.DATABASE_DIRECT_URL ??
      process.env.DATABASE_URL ??
      "postgres://invalid-auth-config@localhost:5432/dossierbox",
  },
});
