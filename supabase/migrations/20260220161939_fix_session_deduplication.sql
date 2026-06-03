/*
  # Fix Session Deduplication

  ## Problem
  Multiple sessions are being created within seconds for the same user because:
  1. React StrictMode invokes effects twice in development
  2. Multiple onAuthStateChange events can fire rapidly on page load
  3. The new concurrent-sessions migration removed the cleanup that prevented duplicates

  ## Solution
  1. Update start_user_session() to return an existing recent session if one was
     created within the last 60 seconds for the same user+IP combination
  2. Clean up existing duplicate sessions (keep the most recently active one per
     user per device cluster — sessions started within 60 seconds of each other)
*/

-- Step 1: Clean up existing duplicate sessions
-- For each cluster of sessions started within 60 seconds of each other for the same user,
-- keep only the most recently active one
WITH session_clusters AS (
  SELECT
    id,
    user_id,
    session_start,
    last_activity,
    ip_address,
    -- Find the "representative" session for this cluster (most recently active)
    FIRST_VALUE(id) OVER (
      PARTITION BY user_id,
        -- Group by 60-second windows
        date_trunc('minute', session_start) + 
        CASE 
          WHEN EXTRACT(second FROM session_start) < 60 THEN interval '0 seconds'
          ELSE interval '60 seconds'
        END
      ORDER BY last_activity DESC
    ) AS keep_id
  FROM user_sessions
  WHERE is_active = true
),
duplicates AS (
  SELECT id
  FROM session_clusters
  WHERE id != keep_id
)
UPDATE user_sessions
SET 
  is_active = false,
  session_end = now()
WHERE id IN (SELECT id FROM duplicates);

-- Step 2: Update start_user_session to deduplicate on rapid re-calls
CREATE OR REPLACE FUNCTION start_user_session(
  p_user_id uuid,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_device_type text DEFAULT 'desktop',
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
  -- Check if a session was started very recently (within 30 seconds) for same user
  -- This prevents duplicate sessions from React StrictMode or rapid auth state changes
  SELECT id INTO v_existing_id
  FROM user_sessions
  WHERE user_id = p_user_id
    AND is_active = true
    AND session_start > now() - interval '30 seconds'
  ORDER BY session_start DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Return the existing recent session instead of creating a duplicate
    RETURN v_existing_id;
  END IF;

  -- Create a new session
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
