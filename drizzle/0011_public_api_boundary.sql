-- DossierBox public API boundary.
--
-- The application uses server-only postgres-js/Drizzle connections as the postgres
-- role. It does not use Supabase PostgREST. Public API roles therefore require no
-- access to application tables, including authentication and user-owned data.
-- RLS is enabled without policies so any future accidental grant still denies rows.

DO $$
DECLARE
  target record;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = current_user
      AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION
      'Security migration requires a role with BYPASSRLS so server database access remains intact';
  END IF;

  FOR target IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      target.relname
    );
  END LOOP;
END
$$;
--> statement-breakpoint
DO $$
DECLARE
  api_role text;
  default_owner text;
BEGIN
  -- PostgreSQL grants EXECUTE on new routines to PUBLIC by default. Since anon
  -- and authenticated inherit PUBLIC privileges, close both the existing and
  -- future RPC surface before handling their direct grants.
  REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public FROM PUBLIC;

  FOREACH default_owner IN ARRAY ARRAY['postgres', 'supabase_admin']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = default_owner) THEN
      BEGIN
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON ROUTINES FROM PUBLIC',
          default_owner
        );
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE
          'Could not alter routine defaults for role % (not a member); review this role separately',
          default_owner;
      END;
    END IF;
  END LOOP;

  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I',
        api_role
      );
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I',
        api_role
      );
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public FROM %I',
        api_role
      );
      FOREACH default_owner IN ARRAY ARRAY[current_user, 'postgres', 'supabase_admin']
      LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = default_owner) THEN
          BEGIN
            EXECUTE format(
              'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %I',
              default_owner,
              api_role
            );
            EXECUTE format(
              'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
              default_owner,
              api_role
            );
            EXECUTE format(
              'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON ROUTINES FROM %I',
              default_owner,
              api_role
            );
          EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE
              'Could not alter defaults for role % (not a member); review this role separately',
              default_owner;
          END;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END
$$;
