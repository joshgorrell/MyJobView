/*
# User Sessions admin visibility hardening

## Purpose
Enhances the User Sessions admin page with tenant-scoped page activity,
current page tracking, Session Time signals, approximate network location
fields, and admin/manager-only access to activity logs. No GPS or browser
location permissions are used -- location is derived from public IP only.

## Changes

### 1. user_sessions table -- new columns
- current_page (text): the page the user currently has open
- city (text): approximate city from public IP geolocation
- region (text): approximate state/region from public IP
- country (text): approximate country from public IP
- isp (text): approximate ISP from public IP
- location_updated_at (timestamptz): when location fields were last refreshed

### 2. user_activity_log table -- new columns and constraints
- organization_id (uuid, FK to organizations): tenant scoping for activity rows
- session_id (uuid, FK to user_sessions): links activity to a specific session
- duration_seconds (integer, default 0): seconds spent on the page before navigating

### 3. Indexes
- idx_user_activity_log_org_time: organization_id + timestamp DESC for tenant queries
- idx_user_activity_log_session: session_id for per-session lookups
- idx_user_activity_log_page: page for per-page analytics

### 4. Data backfill
- Existing user_activity_log rows get organization_id populated from profiles

### 5. Function changes
- DROPs the old 2-arg overload of update_session_activity(p_user_id, p_page)
  that existed in production, leaving only the new 3-arg version
- Replaces the 3-arg update_session_activity with an enhanced version that:
  - Validates the caller can only update their own session
  - Computes elapsed time (capped at 300s) between page views
  - Sets current_page on the session row
  - Inserts page_view activity with duration_seconds and organization_id

### 6. RLS policy changes on user_activity_log
- DROPs the existing broad user_activity_log_select_same_org policy
  (which allowed any org member to read all activity)
- Creates Dealer admins can view organization activity: SELECT scoped to
  same organization AND caller must be admin or manager
- The existing INSERT policy (user_activity_log_insert_same_org) is retained

### 7. Views
- session_page_analytics: per-page rollup with unique users, page views,
  session_time_seconds, joined to department_modules/departments for display names
- session_department_analytics: per-department rollup of the same metrics
- Both views use security_invoker = true so RLS applies

### 8. Comments
- Column comments on user_sessions city/region/country clarify "not GPS"
- View comments clarify Session Time is not payroll or clock time

## Security
- All data is tenant-scoped via organization_id = get_user_org_id()
- Activity log SELECT restricted to admin/manager roles within same org
- Views use security_invoker so RLS policies are enforced
- update_session_activity is SECURITY DEFINER with fixed search_path

## Idempotency
- All ADD COLUMN uses IF NOT EXISTS
- All CREATE INDEX uses IF NOT EXISTS
- Policies use DROP POLICY IF EXISTS before CREATE
- Views use CREATE OR REPLACE
- Function uses CREATE OR REPLACE and explicit DROP of old overload

## Important notes
1. The old 2-arg overload must be dropped first to avoid signature conflicts.
2. The existing broad SELECT policy on user_activity_log must be dropped
   before adding the admin-only replacement, otherwise Postgres ORs both
   policies and the restriction is ineffective.
3. The organization_id column already exists on user_activity_log (with
   DEFAULT get_user_org_id()) but lacks a FK constraint. We add the FK
   separately since ADD COLUMN IF NOT EXISTS skips existing columns.
*/

-- 1. Add new columns to user_sessions
ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS current_page text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS isp text,
  ADD COLUMN IF NOT EXISTS location_updated_at timestamptz;

-- 2. Add new columns to user_activity_log
ALTER TABLE public.user_activity_log
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.user_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duration_seconds integer NOT NULL DEFAULT 0;

-- 2a. Add FK constraint on organization_id if the column already existed without one
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'user_activity_log'
      AND constraint_name = 'user_activity_log_organization_id_fkey'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.user_activity_log
      ADD CONSTRAINT user_activity_log_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_user_activity_log_org_time
  ON public.user_activity_log(organization_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_session
  ON public.user_activity_log(session_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_page
  ON public.user_activity_log(page);

-- 4. Backfill organization_id for existing rows
UPDATE public.user_activity_log ual
SET organization_id = p.organization_id
FROM public.profiles p
WHERE p.id = ual.user_id
  AND ual.organization_id IS NULL;

-- 5. Drop old 2-arg overload of update_session_activity
DROP FUNCTION IF EXISTS public.update_session_activity(uuid, text);

-- 6. Replace 3-arg version with enhanced implementation
CREATE OR REPLACE FUNCTION public.update_session_activity(
  p_user_id uuid DEFAULT NULL,
  p_page text DEFAULT NULL,
  p_session_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_org_id uuid;
  v_previous_activity timestamptz;
  v_elapsed integer := 0;
BEGIN
  IF p_user_id IS NULL THEN p_user_id := auth.uid(); END IF;
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Cannot update another user session';
  END IF;

  SELECT us.id, us.organization_id, us.last_activity
    INTO v_session_id, v_org_id, v_previous_activity
  FROM public.user_sessions us
  WHERE us.user_id = p_user_id
    AND us.is_active = true
    AND (p_session_id IS NULL OR us.id = p_session_id)
  ORDER BY us.last_activity DESC
  LIMIT 1;

  IF v_session_id IS NULL THEN RETURN; END IF;

  v_elapsed := LEAST(300, GREATEST(0, EXTRACT(EPOCH FROM (now() - v_previous_activity))::integer));

  UPDATE public.user_sessions
  SET last_activity = now(),
      current_page = COALESCE(p_page, current_page)
  WHERE id = v_session_id;

  IF p_page IS NOT NULL AND p_page <> '' THEN
    INSERT INTO public.user_activity_log
      (user_id, organization_id, session_id, action, page, duration_seconds)
    VALUES
      (p_user_id, v_org_id, v_session_id, 'page_view', p_page, v_elapsed);
  END IF;
END;
$$;

-- 7. RLS policy changes on user_activity_log
-- Drop the existing broad SELECT policy so the admin-only replacement is effective
DROP POLICY IF EXISTS "user_activity_log_select_same_org" ON public.user_activity_log;
DROP POLICY IF EXISTS "Dealer admins can view organization activity" ON public.user_activity_log;

CREATE POLICY "Dealer admins can view organization activity"
  ON public.user_activity_log FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager')
    )
  );

-- 8. Analytics views
CREATE OR REPLACE VIEW public.session_page_analytics
WITH (security_invoker = true)
AS
SELECT
  ual.organization_id,
  ual.page,
  COALESCE(dm.display_name, initcap(replace(ual.page, '_', ' '))) AS page_name,
  COALESCE(d.name, 'other') AS department_key,
  COALESCE(d.display_name, 'Other') AS department_name,
  COUNT(*) AS page_views,
  COUNT(DISTINCT ual.user_id) AS unique_users,
  SUM(ual.duration_seconds) AS session_time_seconds,
  MAX(ual.timestamp) AS last_viewed
FROM public.user_activity_log ual
LEFT JOIN public.department_modules dm ON dm.module_key = ual.page
LEFT JOIN public.departments d ON d.id = dm.department_id
WHERE ual.action = 'page_view' AND ual.page IS NOT NULL
GROUP BY ual.organization_id, ual.page, dm.display_name, d.name, d.display_name;

CREATE OR REPLACE VIEW public.session_department_analytics
WITH (security_invoker = true)
AS
SELECT
  ual.organization_id,
  COALESCE(d.name, 'other') AS department_key,
  COALESCE(d.display_name, 'Other') AS department_name,
  COUNT(*) AS page_views,
  COUNT(DISTINCT ual.user_id) AS unique_users,
  SUM(ual.duration_seconds) AS session_time_seconds,
  MAX(ual.timestamp) AS last_viewed
FROM public.user_activity_log ual
LEFT JOIN public.department_modules dm ON dm.module_key = ual.page
LEFT JOIN public.departments d ON d.id = dm.department_id
WHERE ual.action = 'page_view' AND ual.page IS NOT NULL
GROUP BY ual.organization_id, d.name, d.display_name;

-- 9. Comments
COMMENT ON VIEW public.session_page_analytics IS
  'Manager/admin product usage analytics. session_time_seconds is MJV Session Time, not payroll or clock time.';
COMMENT ON VIEW public.session_department_analytics IS
  'Department rollup for MJV Session Time and page usage; not payroll or clock time.';

COMMENT ON COLUMN public.user_sessions.city IS 'Approximate city resolved from public IP; not GPS.';
COMMENT ON COLUMN public.user_sessions.region IS 'Approximate state/region resolved from public IP; not GPS.';
COMMENT ON COLUMN public.user_sessions.country IS 'Approximate country resolved from public IP; not GPS.';
