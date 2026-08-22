import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as authSchema from "./schema";
import * as profileSchema from "@/profile/schema";
import * as documentSchema from "@/documents/schema";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://invalid-auth-config@localhost:5432/dossierbox";

/**
 * Connection pool size.
 *
 * This was pinned to 1, which silently serialised the application: several read
 * paths use `Promise.all` to overlap queries, and with a single connection those
 * statements queue behind one another and pay a full network round trip each. The
 * code read as parallel while behaving sequentially, so the intent in the code and
 * the configuration contradicted each other.
 *
 * The default is 3 because that is the widest concurrent fan-out the application
 * actually has — `/profile`, `/profile/review` and `/profile/[section]` each issue
 * three statements together, and nothing issues more. It is derived from the code
 * rather than chosen for headroom.
 *
 * Keeping it that low is deliberate. This deploys to Vercel, where each function
 * instance holds its own pool, so the effective connection count is this number
 * multiplied by however many instances are warm — all drawing on one Supabase
 * pooler quota. Exhausting that quota fails requests rather than slowing them,
 * which is a worse outcome than a query waiting briefly for a connection.
 *
 * Connections open lazily, so this is a ceiling rather than a cost: a request that
 * issues one query still uses one connection. `idle_timeout` returns them promptly,
 * which is what keeps several instances from holding connections they are not using.
 *
 * Overridable because the right ceiling depends on the deployment's pooler quota,
 * which this file cannot know. Raise it against a measured limit, not a guess.
 */
const poolMax = readPositiveInteger(process.env.DATABASE_POOL_MAX, 3);
const idleTimeoutSeconds = readPositiveInteger(process.env.DATABASE_IDLE_TIMEOUT, 20);

const globalForDatabase = globalThis as unknown as {
  dossierBoxSql?: ReturnType<typeof postgres>;
};

const sql =
  globalForDatabase.dossierBoxSql ??
  postgres(databaseUrl, {
    max: poolMax,
    idle_timeout: idleTimeoutSeconds,
    connect_timeout: 10,
    /**
     * Required, not optional: the connection string points at a transaction-mode
     * pooler, which cannot support server-side prepared statements. Removing this
     * produces intermittent "prepared statement already exists" failures under
     * concurrency rather than a clean error.
     */
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.dossierBoxSql = sql;
}

export const db = drizzle(sql, {
  schema: { ...authSchema, ...profileSchema, ...documentSchema },
});

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
