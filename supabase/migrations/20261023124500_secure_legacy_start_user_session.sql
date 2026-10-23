-- Guard the legacy session-start RPC. Its previous SECURITY DEFINER body
-- trusted caller-supplied user/organization/IP values and could create or
-- update another employee's session even when table writes were revoked.
-- Keep the old RPC signature for existing clients, but scope it to auth.uid().
CREATE OR REPLACE FUNCTION public.start_user_session(
  p_user_id uuid,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_device_type text DEFAULT NULL,
  p_browser_name text DEFAULT NULL,
  p_browser_version text DEFAULT NULL,
  p_os_name text DEFAULT NULL,
  p_os_version text DEFAULT NULL,
  p_device_model text DEFAULT NULL,
  p_device_vendor text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_org_id uuid;
  v_existing_id uuid;
  v_session_id uuid;
BEGIN
  IF v_actor IS NULL OR p_user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'Cannot start another user session' USING ERRCODE = '42501';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.profiles WHERE id = v_actor;
  IF v_org_id IS NULL OR
     (p_organization_id IS NOT NULL AND p_organization_id IS DISTINCT FROM v_org_id) THEN
    RAISE EXCEPTION 'Session organization mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_existing_id
  FROM public.user_sessions
  WHERE user_id = v_actor
    AND organization_id = v_org_id
    AND is_active = true
    AND COALESCE(device_type, '') = COALESCE(p_device_type, '')
    AND COALESCE(browser_name, '') = COALESCE(p_browser_name, '')
    AND COALESCE(os_name, '') = COALESCE(p_os_name, '')
  ORDER BY last_activity DESC LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.user_sessions SET last_activity = now()
    WHERE id = v_existing_id AND user_id = v_actor AND organization_id = v_org_id;
    RETURN v_existing_id;
  END IF;

  -- Client-provided IP addresses are untrusted; the authenticated
  -- session-location Edge Function fills this field from request metadata.
  INSERT INTO public.user_sessions (
    user_id, session_start, last_activity, ip_address, user_agent, is_active,
    device_type, browser_name, browser_version, os_name, os_version,
    device_model, device_vendor, organization_id
  ) VALUES (
    v_actor, now(), now(), NULL, p_user_agent, true,
    p_device_type, p_browser_name, p_browser_version, p_os_name, p_os_version,
    p_device_model, p_device_vendor, v_org_id
  ) RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_user_session(
  uuid, text, text, text, text, text, text, text, text, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_user_session(
  uuid, text, text, text, text, text, text, text, text, text, uuid
) TO authenticated;
