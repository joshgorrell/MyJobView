-- Restrict browser-session writes to authenticated, ownership-checked RPCs.
-- Session location is written by the authenticated Edge Function using its
-- server-only service-role client after constraining the update to auth user.
BEGIN;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_sessions FROM anon, authenticated;
DROP POLICY IF EXISTS user_sessions_update_same_org ON public.user_sessions;
DROP POLICY IF EXISTS user_sessions_insert_same_org ON public.user_sessions;

-- Session history contains IP and device information. Employees may see
-- their own sessions; only their organization's administrators may inspect
-- other employees' sessions. A same-org employee alone is not sufficient.
DROP POLICY IF EXISTS user_sessions_select_same_org ON public.user_sessions;
DROP POLICY IF EXISTS user_sessions_select_owner_or_org_admin ON public.user_sessions;
CREATE POLICY user_sessions_select_owner_or_org_admin
ON public.user_sessions FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (
    organization_id = (SELECT public.get_user_org_id())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.organization_id = user_sessions.organization_id
        AND p.role IN ('admin', 'superadmin')
    )
  )
);


CREATE OR REPLACE FUNCTION public.end_user_session(
  p_user_id uuid DEFAULT NULL,
  p_session_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  -- Retain the existing no-op behavior when no specific session is supplied.
  IF p_session_id IS NULL THEN
    RETURN;
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'Cannot end another user session' USING ERRCODE = '42501';
  END IF;

  UPDATE public.user_sessions
  SET is_active = false, session_end = now()
  WHERE id = p_session_id
    AND user_id = v_actor
    AND is_active = true;
END;
$$;

-- The old global midnight schedule is retired only during the coordinated
-- cutover. Remove browser/API write access now so nobody can re-enable it.
-- The deployment owner can still disable it transactionally via SQL after
-- the replacement application has been verified.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON public.session_logout_schedule FROM anon, authenticated;
DROP POLICY IF EXISTS "Admins can insert session logout schedule"
ON public.session_logout_schedule;
DROP POLICY IF EXISTS "Admins can update session logout schedule"
ON public.session_logout_schedule;

REVOKE ALL ON FUNCTION public.end_user_session(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_user_session(uuid, uuid) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
