/*
  # Update start_user_session to accept device information

  1. Changes
    - Update start_user_session function to accept device info parameters
    - Parse and store device information when starting a session
*/

-- Update function to start a new session with device information
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
  -- End any existing active sessions for this user
  UPDATE user_sessions
  SET
    is_active = false,
    session_end = now()
  WHERE user_id = p_user_id
    AND is_active = true;

  -- Create new session with device information
  INSERT INTO user_sessions (
    user_id,
    ip_address,
    user_agent,
    device_type,
    browser_name,
    browser_version,
    os_name,
    os_version,
    device_model,
    device_vendor
  )
  VALUES (
    p_user_id,
    p_ip_address,
    p_user_agent,
    p_device_type,
    p_browser_name,
    p_browser_version,
    p_os_name,
    p_os_version,
    p_device_model,
    p_device_vendor
  )
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;
