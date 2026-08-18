import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as authSchema from "./schema";
import * as profileSchema from "@/profile/schema";
import * as documentSchema from "@/documents/schema";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://invalid-auth-config@localhost:5432/dossierbox";

const globalForDatabase = globalThis as unknown as {
  dossierBoxSql?: ReturnType<typeof postgres>;
};

const sql =
  globalForDatabase.dossierBoxSql ??
  postgres(databaseUrl, {
    max: 1,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.dossierBoxSql = sql;
}

export const db = drizzle(sql, {
  schema: { ...authSchema, ...profileSchema, ...documentSchema },
});
