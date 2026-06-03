/*
  # Allow Multiple Concurrent Sessions Per User

  ## Summary
  Previously, start_user_session() closed all existing sessions for a user before
  creating a new one — meaning logging in on Device B would terminate Device A's
  session, so the Active Sessions count would always show 1 per user maximum.

  This migration changes the system to allow multiple concurrent sessions per user
  (one per device/browser tab), so each login creates an independent session record.

  ## Changes
  1. `start_user_session()` — remove the step that closes existing sessions
  2. `end_user_session()` — new version accepts p_session_id (uuid) to close a
     specific session; falls back to closing all active sessions by user_id if
     only p_user_id is given (for sendBeacon / logout flows)
  3. `update_session_activity()` — new version prefers p_session_id for precise
     per-tab updates; falls back to updating the most-recently-active session for
     the user when only p_user_id is provided (backwards compat)

  ## Notes
  - Old sessions will still be cleaned up by cleanup_stale_sessions() after 30
    minutes of inactivity, so stale tabs do not accumulate forever.
  - The force-logout edge function already closes all sessions by user_id in bulk,
    so multi-session support doesn't affect that path.
*/

-- 1. Update start_user_session: do NOT close existing sessions
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
  p_device_vendor text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
BEGIN
  INSERT INTO user_sessions (
    user_id, ip_address, user_agent, device_type,
    browser_name, browser_version, os_name, os_version,
    device_model, device_vendor
  )
  VALUES (
    p_user_id, p_ip_address, p_user_agent, p_device_type,
    p_browser_name, p_browser_version, p_os_name, p_os_version,
    p_device_model, p_device_vendor
  )
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;

-- 2. Update end_user_session: close specific session by ID, or all by user_id
CREATE OR REPLACE FUNCTION end_user_session(
  p_user_id uuid DEFAULT NULL,
  p_session_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_session_id IS NOT NULL THEN
    UPDATE user_sessions
    SET
      is_active = false,
      session_end = now()
    WHERE id = p_session_id
      AND is_active = true;
  ELSIF p_user_id IS NOT NULL THEN
    UPDATE user_sessions
    SET
      is_active = false,
      session_end = now()
    WHERE user_id = p_user_id
      AND is_active = true;
  END IF;
END;
$$;

-- 3. Update update_session_activity: prefer session_id, fallback to user_id
CREATE OR REPLACE FUNCTION update_session_activity(
  p_user_id uuid DEFAULT NULL,
  p_page text DEFAULT NULL,
  p_session_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_session_id IS NOT NULL THEN
    UPDATE user_sessions
    SET last_activity = now()
    WHERE id = p_session_id
      AND is_active = true;
  ELSIF p_user_id IS NOT NULL THEN
    UPDATE user_sessions
    SET last_activity = now()
    WHERE user_id = p_user_id
      AND is_active = true
      AND last_activity = (
        SELECT MAX(last_activity)
        FROM user_sessions
        WHERE user_id = p_user_id
          AND is_active = true
      );
  END IF;
END;
$$;
