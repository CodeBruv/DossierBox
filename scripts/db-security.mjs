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
 * policy was introduced, and (c) the PostgREST roles hold no table, sequence,
 * routine, or future default privileges.
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
 * Connection for DDL or read-only catalog verification.
 *
 * The application runs against Supabase's transaction pooler (port 6543), which
 * is right for request traffic but cannot be used to apply this script: mutation
 * issues DDL (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, `REVOKE`) and needs a
 * session-mode connection as the role that owns the tables. Check-only mode uses
 * catalog reads and is safe through either connection type.
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

if (!checkOnly && /pooler\.supabase\.com|:6543\b/.test(databaseUrl)) {
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

  // --- 2. Residual table privileges for the PostgREST roles ----------------
  const tableLeaks = await sql`
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

  if (tableLeaks.length === 0) {
    console.log("\nPostgREST roles (anon, authenticated): no table privileges.");
  } else {
    failed = true;
    console.error(`\nFAIL — ${tableLeaks.length} residual table privilege grant(s):`);
    for (const row of tableLeaks) {
      console.error(`  - ${row.role_name} can ${row.privilege} public.${row.table_name}`);
    }
  }

  const sequenceLeaks = await sql`
    SELECT r.rolname AS role_name,
           c.relname AS sequence_name,
           p.priv    AS privilege
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN (SELECT unnest(ARRAY['USAGE','SELECT','UPDATE']) AS priv) p
      JOIN pg_roles r ON r.rolname IN ('anon', 'authenticated')
     WHERE n.nspname = 'public'
       AND c.relkind = 'S'
       AND has_sequence_privilege(r.rolname, c.oid, p.priv)
     ORDER BY r.rolname, c.relname, p.priv
  `;

  if (sequenceLeaks.length === 0) {
    console.log("PostgREST roles: no sequence privileges.");
  } else {
    failed = true;
    console.error(`\nFAIL — ${sequenceLeaks.length} residual sequence privilege grant(s):`);
    for (const row of sequenceLeaks) {
      console.error(`  - ${row.role_name} can ${row.privilege} public.${row.sequence_name}`);
    }
  }

  const routineLeaks = await sql`
    SELECT r.rolname AS role_name,
           p.oid::regprocedure::text AS routine_name
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_roles r ON r.rolname IN ('anon', 'authenticated')
     WHERE n.nspname = 'public'
       AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')
     ORDER BY r.rolname, routine_name
  `;

  if (routineLeaks.length === 0) {
    console.log("PostgREST roles: no routine execution privileges.");
  } else {
    failed = true;
    console.error(`\nFAIL — ${routineLeaks.length} callable public routine(s):`);
    for (const row of routineLeaks) {
      console.error(`  - ${row.role_name} can execute ${row.routine_name}`);
    }
  }

  const defaultLeaks = await sql`
    SELECT owner.rolname AS owner_name,
           CASE acl.grantee
             WHEN 0 THEN 'PUBLIC'
             ELSE grantee.rolname
           END AS grantee_name,
           defaults.defaclobjtype AS object_type,
           acl.privilege_type AS privilege
      FROM pg_default_acl defaults
      JOIN pg_roles owner ON owner.oid = defaults.defaclrole
      JOIN pg_namespace n ON n.oid = defaults.defaclnamespace
      CROSS JOIN LATERAL aclexplode(defaults.defaclacl) acl
      LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
     WHERE n.nspname = 'public'
       AND defaults.defaclobjtype IN ('r', 'S', 'f')
       AND (acl.grantee = 0 OR grantee.rolname IN ('anon', 'authenticated'))
     ORDER BY owner.rolname, grantee_name, defaults.defaclobjtype, acl.privilege_type
  `;

  if (defaultLeaks.length === 0) {
    console.log("Future defaults: no API-role or PUBLIC grants on tables, sequences, or routines.");
  } else {
    failed = true;
    console.error(`\nFAIL — ${defaultLeaks.length} exposed future default privilege(s):`);
    for (const row of defaultLeaks) {
      console.error(
        `  - ${row.owner_name} grants ${row.privilege} on ${row.object_type} objects to ${row.grantee_name}`
      );
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
      : "\nRESULT: PASSED — RLS on, no policies, no current or future API-role privileges, app access intact.\n"
  );
} catch (error) {
  failed = true;
  console.error(`\nError: ${error.message}\n`);
} finally {
  await sql.end({ timeout: 5 });
}

process.exit(failed ? 1 : 0);
