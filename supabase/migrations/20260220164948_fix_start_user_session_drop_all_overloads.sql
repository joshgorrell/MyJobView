/*
  # Drop all overloaded versions of start_user_session and replace with one

  ## Problem
  Multiple migrations created different overloaded versions of start_user_session
  with different parameter signatures. PostgreSQL was resolving calls to the old
  2-parameter version (p_user_id, p_ip_address, p_user_agent) that closes all
  existing sessions before creating a new one — so every new session wiped out
  all other active sessions, resulting in 0 or 1 sessions shown.

  ## Fix
  Drop all existing overloads by their exact signatures, then create a single
  canonical version that deduplicates per-device (not per-user).
*/

-- Drop all known overloads
DROP FUNCTION IF EXISTS start_user_session(uuid, text, text);
DROP FUNCTION IF EXISTS start_user_session(uuid, text, text, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS start_user_session(uuid, text, text, text, text, text, text, text, text, text, uuid);

-- Recreate single canonical version
CREATE OR REPLACE FUNCTION start_user_session(
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
BEGIN
  -- Deduplicate only for the exact same device+IP within 30 seconds
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
    AND COALESCE(ip_address, '')   = COALESCE(p_ip_address, '')
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
    p_organization_id
  )
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;
