/*
  # Fix end_user_session to only close the specific session

  ## Problem
  The old 1-argument overload of end_user_session closes ALL active sessions
  for a user. The beforeunload event fires on every page navigation in an SPA,
  calling this function and wiping out all sessions — including ones from other
  devices. This caused the session viewer to always show 0 active sessions.

  ## Fix
  - Drop the dangerous 1-arg overload
  - Keep only the 2-arg version that targets by session_id
  - Increase stale session timeout from 30 min to 4 hours so sessions survive
    normal usage gaps
*/

-- Drop the dangerous single-arg overload that closes ALL sessions for a user
DROP FUNCTION IF EXISTS end_user_session(uuid);

-- Recreate the 2-arg version to be explicit: prefer session_id, fall back to user_id only if no session_id given
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
    -- Only close this specific session
    UPDATE user_sessions
    SET
      is_active = false,
      session_end = now()
    WHERE id = p_session_id
      AND is_active = true;
  END IF;
  -- If only p_user_id is provided with no session_id, do nothing
  -- (prevents accidental bulk-close of all sessions)
END;
$$;

-- Extend stale session timeout to 4 hours (was 30 min — too aggressive for normal use)
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
    session_end = last_activity + INTERVAL '4 hours'
  WHERE is_active = true
    AND last_activity < now() - INTERVAL '4 hours';
END;
$$;
