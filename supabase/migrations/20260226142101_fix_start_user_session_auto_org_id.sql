/*
  # Fix start_user_session to auto-populate organization_id

  ## Problem
  The start_user_session function requires p_organization_id but AuthContext
  never passes it (always NULL). Sessions after the organization_id column was
  added stopped being created or were being inserted with NULL organization_id,
  making them invisible to the RLS SELECT policy which requires
  organization_id = get_user_org_id().

  ## Fix
  When p_organization_id is NULL, automatically look up the user's organization_id
  from their profile. This makes session creation fully automatic with no changes
  needed on the client side.
*/

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
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_existing_id uuid;
  v_org_id uuid;
BEGIN
  -- Auto-resolve organization_id from profile when not provided
  IF p_organization_id IS NULL THEN
    SELECT organization_id INTO v_org_id
    FROM profiles
    WHERE id = p_user_id;
  ELSE
    v_org_id := p_organization_id;
  END IF;

  -- Deduplicate only for the exact same device within 30 seconds
  -- (prevents React StrictMode double-invocation duplicates without
  --  collapsing sessions from different devices)
  SELECT id INTO v_existing_id
  FROM user_sessions
  WHERE user_id = p_user_id
    AND is_active = true
    AND session_start > now() - interval '30 seconds'
    AND COALESCE(device_type, '')  = COALESCE(p_device_type, '')
    AND COALESCE(browser_name, '') = COALESCE(p_browser_name, '')
    AND COALESCE(os_name, '')      = COALESCE(p_os_name, '')
  ORDER BY session_start DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  INSERT INTO user_sessions (
    user_id,
    session_start,
    last_activity,
    ip_address,
    user_agent,
    is_active,
    device_type,
    browser_name,
    browser_version,
    os_name,
    os_version,
    device_model,
    device_vendor,
    organization_id
  ) VALUES (
    p_user_id,
    now(),
    now(),
    p_ip_address,
    p_user_agent,
    true,
    p_device_type,
    p_browser_name,
    p_browser_version,
    p_os_name,
    p_os_version,
    p_device_model,
    p_device_vendor,
    v_org_id
  )
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;
