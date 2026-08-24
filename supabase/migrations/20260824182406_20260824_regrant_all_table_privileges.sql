-- Re-grant SELECT on ALL public tables and views to authenticated and anon roles.
-- These grants were silently dropped by ALTER TABLE operations across many migrations,
-- causing 403 "permission denied" errors on pages throughout the site.

-- Grant SELECT on all base tables in public schema
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', r.table_name);
    EXECUTE format('GRANT SELECT ON public.%I TO anon', r.table_name);
  END LOOP;
END $$;

-- Grant SELECT on all views in public schema
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT table_name FROM information_schema.views
    WHERE table_schema = 'public'
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', r.table_name);
    EXECUTE format('GRANT SELECT ON public.%I TO anon', r.table_name);
  END LOOP;
END $$;

-- Re-grant INSERT, UPDATE, DELETE on tables the frontend writes to.
-- These were also dropped by ALTER TABLE operations.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('GRANT INSERT, UPDATE, DELETE ON public.%I TO authenticated', r.table_name);
    EXECUTE format('GRANT INSERT, UPDATE, DELETE ON public.%I TO anon', r.table_name);
  END LOOP;
END $$;
