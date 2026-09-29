/*
  # User Sessions admin visibility hardening

  Adds tenant-scoped page activity, current page, active-time signals, approximate
  network location fields, and trusted/unusual-location support without collecting GPS.
*/

ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS current_page text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS isp text,
  ADD COLUMN IF NOT EXISTS location_updated_at timestamptz;

ALTER TABLE public.user_activity_log
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.user_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duration_seconds integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_user_activity_log_org_time
  ON public.user_activity_log(organization_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_session
  ON public.user_activity_log(session_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_page
  ON public.user_activity_log(page);

UPDATE public.user_activity_log ual
SET organization_id = p.organization_id
FROM public.profiles p
WHERE p.id = ual.user_id
  AND ual.organization_id IS NULL;

DROP POLICY IF EXISTS "Admins can view all activity" ON public.user_activity_log;
CREATE POLICY "Dealer admins can view organization activity"
  ON public.user_activity_log FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager')
    )
  );

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

COMMENT ON VIEW public.session_page_analytics IS
  'Manager/admin product usage analytics. session_time_seconds is MJV Session Time, not payroll or clock time.';
COMMENT ON VIEW public.session_department_analytics IS
  'Department rollup for MJV Session Time and page usage; not payroll or clock time.';

COMMENT ON COLUMN public.user_sessions.city IS 'Approximate city resolved from public IP; not GPS.';
COMMENT ON COLUMN public.user_sessions.region IS 'Approximate state/region resolved from public IP; not GPS.';
COMMENT ON COLUMN public.user_sessions.country IS 'Approximate country resolved from public IP; not GPS.';
