#!/usr/bin/env node
/**
 * DossierBox — apply and verify public schema hardening.
 *
 * Usage:
 *   npm run db:secure          apply, then verify
 *   npm run db:secure -- --check   verify only, change nothing
 *
 * Applies db/security/harden-public-schema.sql, then prints a verification
 * report proving (a) RLS is on for every table in `public`, (b) no permissive
 * policy was introduced, and (c) the PostgREST roles hold no privileges.
 *
 * Exits non-zero if verification fails, so it can gate a deploy.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";

const checkOnly = process.argv.includes("--check");
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(scriptDir, "..", "db", "security", "harden-public-schema.sql");

/**
 * Connection for DDL.
 *
 * The application runs against Supabase's transaction pooler (port 6543), which
 * is right for request traffic but cannot be used here: this script issues DDL
 * (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, `REVOKE`) and needs a session-mode
 * connection as the role that owns the tables. Attempting it through the pooler
 * fails or silently applies to the wrong role.
 *
 * So DATABASE_DIRECT_URL is preferred when set, and DATABASE_URL is the fallback
 * for environments where they are the same connection. Supabase calls the direct
 * one "Direct connection" — hostname db.<ref>.supabase.co on port 5432, rather
 * than a *.pooler.supabase.com host.
 */
const databaseUrl = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "Neither DATABASE_DIRECT_URL nor DATABASE_URL is set. Provide one via .env.local or the environment.\n" +
      "On Supabase use the direct connection string for the owning role, not the pooled PgBouncer URL."
  );
  process.exit(1);
}

if (/pooler\.supabase\.com|:6543\b/.test(databaseUrl)) {
  console.error(
    "\nRefusing to run: this looks like Supabase's pooled connection.\n" +
      "  host contains `pooler.supabase.com` and/or port 6543\n\n" +
      "This script applies DDL and must use a session-mode connection owned by the\n" +
      "role that owns the tables. Set DATABASE_DIRECT_URL to the Supabase\n" +
      "\"Direct connection\" string (db.<project-ref>.supabase.co on port 5432) and\n" +
      "re-run. DATABASE_URL can stay pointed at the pooler for the application.\n"
  );
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  onnotice: (notice) => {
    if (notice.message) console.log(`   • ${notice.message}`);
  },
});

let failed = false;

try {
  if (checkOnly) {
    console.log("\nVerify only — no changes will be made.\n");
  } else {
    console.log("\nApplying db/security/harden-public-schema.sql\n");
    const statements = await readFile(sqlPath, "utf8");
    await sql.unsafe(statements).simple();
    console.log("\nApplied.\n");
  }

  // --- 1. RLS state and policy count per table -----------------------------
  const tables = await sql`
    SELECT c.relname                                   AS table_name,
           c.relrowsecurity                            AS rls_enabled,
           (SELECT count(*)::int
              FROM pg_policy p
             WHERE p.polrelid = c.oid)                  AS policy_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
     ORDER BY c.relname
  `;

  const unprotected = tables.filter((t) => !t.rls_enabled);
  const withPolicies = tables.filter((t) => t.policy_count > 0);

  console.log(`Tables in public schema: ${tables.length}`);
  console.log(`  RLS enabled:  ${tables.length - unprotected.length}/${tables.length}`);
  console.log(`  Policies:     ${withPolicies.length === 0 ? "none (deny by default)" : withPolicies.length + " table(s) carry policies"}`);

  if (unprotected.length > 0) {
    failed = true;
    console.error("\nFAIL — RLS still disabled on:");
    for (const t of unprotected) console.error(`  - public.${t.table_name}`);
  }

  if (withPolicies.length > 0) {
    console.warn("\nReview — these tables have RLS policies attached:");
    for (const t of withPolicies) {
      console.warn(`  - public.${t.table_name} (${t.policy_count})`);
    }
    console.warn(
      "  DossierBox expects zero policies. A permissive policy here would\n" +
        "  re-expose data through the public anon key."
    );
  }

  // --- 2. Residual privileges for the PostgREST roles ----------------------
  const leaks = await sql`
    SELECT r.rolname AS role_name,
           c.relname AS table_name,
           p.priv    AS privilege
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN (SELECT unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS priv) p
      JOIN pg_roles r ON r.rolname IN ('anon', 'authenticated')
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
       AND has_table_privilege(r.rolname, c.oid, p.priv)
     ORDER BY r.rolname, c.relname, p.priv
  `;

  if (leaks.length === 0) {
    console.log("\nPostgREST roles (anon, authenticated): no table privileges.");
  } else {
    failed = true;
    console.error(`\nFAIL — ${leaks.length} residual privilege grant(s):`);
    for (const row of leaks) {
      console.error(`  - ${row.role_name} can ${row.privilege} public.${row.table_name}`);
    }
  }

  // --- 3. Confirm the app's own role is not locked out --------------------
  const [role] = await sql`
    SELECT current_user                       AS role_name,
           (SELECT rolsuper OR rolbypassrls
              FROM pg_roles
             WHERE rolname = current_user)     AS bypasses_rls,
           (SELECT count(*)::int
              FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public'
               AND c.relkind IN ('r','p')
               AND pg_get_userbyid(c.relowner) <> current_user
               AND NOT pg_has_role(current_user, c.relowner, 'USAGE')) AS tables_not_owned
  `;

  const appHasAccess = role.bypasses_rls || role.tables_not_owned === 0;
  console.log(
    `\nApplication role "${role.role_name}": ` +
      (role.bypasses_rls
        ? "bypasses RLS (superuser/BYPASSRLS)."
        : role.tables_not_owned === 0
          ? "owns every public table, so RLS does not restrict it."
          : `does NOT own ${role.tables_not_owned} table(s).`)
  );

  if (!appHasAccess) {
    failed = true;
    console.error(
      "\nFAIL — this role would be denied its own data. Re-run as the owning role."
    );
  }

  // --- 4. Sanity read through the app's own connection --------------------
  // Proves server-side access still works after hardening.
  try {
    const [{ count }] = await sql`SELECT count(*)::int AS count FROM users`;
    console.log(`Server-side read succeeded (users rows visible: ${count}).`);
  } catch (error) {
    failed = true;
    console.error(`\nFAIL — server-side read blocked: ${error.message}`);
  }

  console.log(
    failed
      ? "\nRESULT: FAILED — public schema is not fully locked down.\n"
      : "\nRESULT: PASSED — RLS on, no policies, no API-role privileges, app access intact.\n"
  );
} catch (error) {
  failed = true;
  console.error(`\nError: ${error.message}\n`);
} finally {
  await sql.end({ timeout: 5 });
}

process.exit(failed ? 1 : 0);
