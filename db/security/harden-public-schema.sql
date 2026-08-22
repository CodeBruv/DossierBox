-- =============================================================================
-- DossierBox — public schema hardening
-- =============================================================================
-- Purpose
--   Close the Supabase advisor findings `rls_disabled_in_public` and
--   `sensitive_columns_exposed` without granting anyone broad read access.
--
-- Why this is required
--   Every DossierBox table lives in the `public` schema because Drizzle
--   migrations create it there. On Supabase, `public` is published through
--   PostgREST and is reachable with the *publishable* `anon` key, which is
--   designed to ship inside browsers. Because no table had RLS enabled and no
--   privileges had been revoked, the following were readable and writable by
--   anyone holding that public key:
--
--     sessions.sessionToken          -> session theft, full account takeover
--     auth_tokens.tokenHash          -> password-reset token theft
--     auth_credentials.passwordHash  -> offline cracking of password hashes
--     accounts.refresh_token         -> Google OAuth refresh/access/id tokens
--     accounts.access_token
--     accounts.id_token
--     users.email                    -> account enumeration / PII
--     documents, profile*            -> private career information
--
-- Design decision: deny by default, no policies
--   This script enables RLS and creates NO policies at all. With RLS enabled
--   and no matching policy, PostgreSQL denies every row to non-owner roles, so
--   `anon` and `authenticated` get nothing. It deliberately does NOT add a
--   permissive policy, because a permissive policy is what would re-expose the
--   data it is meant to protect.
--
--   DossierBox never uses PostgREST or a Supabase client library. All database
--   access is server-side, through `postgres-js` + Drizzle over DATABASE_URL
--   (see src/auth/database.ts, which is `server-only`). Authorization is
--   already enforced in application code by ownership-scoped queries. So the
--   API roles need no access whatsoever, and removing it costs the app nothing.
--
--   Table owners bypass RLS by default (PostgreSQL only applies RLS to owners
--   under FORCE ROW LEVEL SECURITY, which this script does not set). The
--   application role owns these tables, so server-side queries are unaffected.
--
-- Idempotent: safe to run repeatedly. Run it after every `npm run db:migrate`
-- so newly created tables are covered too.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Pre-flight guard: refuse to run if it would lock the application out.
--
--    Enabling RLS is only safe here because the connecting role bypasses it.
--    That is true if the role is a superuser, has BYPASSRLS, or owns the
--    tables. If none of those hold, enabling RLS would deny the application
--    its own data, so abort instead. The surrounding transaction rolls back
--    and the database is left exactly as it was.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  bypasses boolean;
  not_owned text[];
BEGIN
  SELECT rolsuper OR rolbypassrls INTO bypasses
  FROM pg_roles WHERE rolname = current_user;

  IF bypasses THEN
    RAISE NOTICE 'Role % bypasses RLS (superuser/BYPASSRLS).', current_user;
    RETURN;
  END IF;

  SELECT array_agg(c.relname ORDER BY c.relname) INTO not_owned
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND pg_get_userbyid(c.relowner) <> current_user
    AND NOT pg_has_role(current_user, c.relowner, 'USAGE');

  IF not_owned IS NOT NULL THEN
    RAISE EXCEPTION
      'Aborting: role % neither owns nor bypasses RLS for: %. Enabling RLS would lock the application out of its own tables. Run this as the owning role (on Supabase, the `postgres` role from your direct DATABASE_URL).',
      current_user, array_to_string(not_owned, ', ');
  END IF;

  RAISE NOTICE 'Role % owns every public table; safe to enable RLS.', current_user;
END
$$;

-- -----------------------------------------------------------------------------
-- 1. Enable row level security on every base table in `public`.
--    Loops over the live catalog rather than a hardcoded list, so a table added
--    by a future migration cannot silently ship unprotected.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')          -- ordinary + partitioned tables
      AND c.relrowsecurity IS FALSE        -- skip tables already protected
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      target.relname
    );
    RAISE NOTICE 'RLS enabled on public.%', target.relname;
  END LOOP;
END
$$;

-- -----------------------------------------------------------------------------
-- 2. Remove all privileges from the PostgREST-facing roles.
--    RLS alone already denies the rows; revoking the grants is defence in
--    depth, so a future `DISABLE ROW LEVEL SECURITY` cannot silently re-expose
--    the tables. Guarded by a role-existence check so this file also runs on a
--    plain (non-Supabase) PostgreSQL instance used for local development.
--
--    `service_role` is intentionally left alone: it bypasses RLS by design, it
--    is a secret-key role that must never reach a browser, and DossierBox does
--    not use it. Revoke it too if you never intend to adopt Supabase tooling.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM %I', api_role);

      -- Stop future tables from inheriting grants. ALTER DEFAULT PRIVILEGES is
      -- scoped to the creating role, so this is applied for the role running
      -- migrations (current_user) and for `postgres`, which is what Supabase
      -- uses to seed its own default grants.
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM %I',
        current_user, api_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I',
        current_user, api_role
      );

      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres')
         AND current_user <> 'postgres' THEN
        -- Requires membership of `postgres`. Non-fatal if not permitted: the
        -- revokes above already removed every existing grant.
        BEGIN
          EXECUTE format(
            'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM %I',
            api_role
          );
          EXECUTE format(
            'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I',
            api_role
          );
        EXCEPTION WHEN insufficient_privilege THEN
          RAISE NOTICE
            'Could not alter default privileges for role postgres (not a member). Re-run this script after any migration that creates tables.';
        END;
      END IF;

      RAISE NOTICE 'Privileges revoked for role %', api_role;
    ELSE
      RAISE NOTICE 'Role % not present; skipping (expected outside Supabase)', api_role;
    END IF;
  END LOOP;
END
$$;

COMMIT;
