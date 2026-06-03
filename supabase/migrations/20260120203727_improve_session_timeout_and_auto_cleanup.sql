/*
  # Improve Session Timeout and Auto-Cleanup

  1. Changes
    - Reduce session timeout from 8 hours to 30 minutes
    - Add automatic cleanup trigger on session queries
    - Update cleanup function to be more aggressive
    - Add function to cleanup on admin view

  2. Rationale
    - 30 minutes is more realistic for active sessions
    - Sessions that are inactive for 30+ minutes should be marked as ended
    - Admins should see accurate "currently online" data
*/

-- Update cleanup function to use 30 minute timeout instead of 8 hours
CREATE OR REPLACE FUNCTION cleanup_stale_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_sessions
  SET
    is_active = false,
    session_end = last_activity + INTERVAL '30 minutes'
  WHERE is_active = true
    AND last_activity < now() - INTERVAL '30 minutes';
END;
$$;

-- Create function to get active sessions with automatic cleanup
CREATE OR REPLACE FUNCTION get_active_sessions_with_cleanup()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  session_start timestamptz,
  session_end timestamptz,
  last_activity timestamptz,
  ip_address text,
  user_agent text,
  is_active boolean,
  duration_seconds integer,
  device_type text,
  browser_name text,
  browser_version text,
  os_name text,
  os_version text,
  device_model text,
  device_vendor text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- First, cleanup stale sessions
  PERFORM cleanup_stale_sessions();
  
  -- Then return active sessions
  RETURN QUERY
  SELECT 
    us.id,
    us.user_id,
    us.session_start,
    us.session_end,
    us.last_activity,
    us.ip_address,
    us.user_agent,
    us.is_active,
    us.duration_seconds,
    us.device_type,
    us.browser_name,
    us.browser_version,
    us.os_name,
    us.os_version,
    us.device_model,
    us.device_vendor
  FROM user_sessions us
  WHERE us.is_active = true
  ORDER BY us.last_activity DESC;
END;
$$;

-- Update the update_session_activity function to also cleanup stale sessions periodically
CREATE OR REPLACE FUNCTION update_session_activity(
  p_user_id uuid,
  p_page text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update last_activity for active session
  UPDATE user_sessions
  SET last_activity = now()
  WHERE user_id = p_user_id
    AND is_active = true;

  -- Log activity if page provided
  IF p_page IS NOT NULL THEN
    INSERT INTO user_activity_log (user_id, action, page)
    VALUES (p_user_id, 'page_view', p_page);
  END IF;
  
  -- Cleanup stale sessions occasionally (10% chance to reduce overhead)
  IF random() < 0.1 THEN
    PERFORM cleanup_stale_sessions();
  END IF;
END;
$$;

COMMENT ON FUNCTION cleanup_stale_sessions() IS 'Automatically ends sessions that have been inactive for more than 30 minutes';
COMMENT ON FUNCTION get_active_sessions_with_cleanup() IS 'Returns active sessions after cleaning up stale ones';
