/*
  # Fix session deduplication - update existing active sessions instead of creating new ones

  ## Problem
  The start_user_session function only deduplicates within a 30-second window. After that, every
  page refresh, navigation, or auth state change creates a brand new "active" session row for
  the same physical device, causing users to accumulate dozens of "active" sessions.

  ## Fix
  - If the same user already has an active session on the same device type + browser + OS,
    update its last_activity timestamp instead of inserting a new row
  - The per-device deduplication is permanent (no time window) - one active session per device fingerprint
  - Also mark stale "active" sessions as ended if last_activity is older than 4 hours
    (handles sessions that were never properly closed)

  ## Cleanup
  - Mark all currently-stale active sessions (inactive for > 4 hours) as ended
*/

-- First, clean up stale active sessions that were never ended properly
-- (active = true but last_activity was more than 4 hours ago)
UPDATE user_sessions
SET 
  is_active = false,
  session_end = last_activity
WHERE is_active = true
  AND last_activity < now() - interval '4 hours';

-- For each user+device combination that has multiple active sessions,
-- keep only the most recently active one and close the rest
WITH ranked AS (
  SELECT 
    id,
    user_id,
    device_type,
    browser_name,
    os_name,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, COALESCE(device_type,''), COALESCE(browser_name,''), COALESCE(os_name,'')
      ORDER BY last_activity DESC
    ) as rn
  FROM user_sessions
  WHERE is_active = true
)
UPDATE user_sessions us
SET 
  is_active = false,
  session_end = us.last_activity
FROM ranked r
WHERE us.id = r.id
  AND r.rn > 1;

-- Replace start_user_session function with one that uses permanent per-device deduplication
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

  -- Check for any existing active session on the same device fingerprint (no time window)
  SELECT id INTO v_existing_id
  FROM user_sessions
  WHERE user_id = p_user_id
    AND is_active = true
    AND COALESCE(device_type, '')  = COALESCE(p_device_type, '')
    AND COALESCE(browser_name, '') = COALESCE(p_browser_name, '')
    AND COALESCE(os_name, '')      = COALESCE(p_os_name, '')
  ORDER BY last_activity DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Update last_activity on the existing session instead of creating a duplicate
    UPDATE user_sessions
    SET last_activity = now()
    WHERE id = v_existing_id;
    RETURN v_existing_id;
  END IF;

  -- No existing active session for this device — create a new one
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
