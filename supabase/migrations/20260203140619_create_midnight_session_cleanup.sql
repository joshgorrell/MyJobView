/*
  # Midnight Session Cleanup System

  1. New Function
    - `midnight_session_cleanup()` - Closes all sessions at midnight except those active in last 5 minutes

  2. Changes
    - Creates function to be called by scheduled edge function
    - Returns count of sessions closed for logging purposes

  3. Logic
    - Finds all active sessions where last_activity is older than 5 minutes
    - Closes those sessions by setting is_active = false and session_end = now()
    - Keeps sessions active if user was active within last 5 minutes
*/

-- Function to cleanup sessions at midnight
CREATE OR REPLACE FUNCTION midnight_session_cleanup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sessions_closed integer;
  v_result jsonb;
BEGIN
  -- Close all active sessions where last activity was more than 5 minutes ago
  WITH closed_sessions AS (
    UPDATE user_sessions
    SET
      is_active = false,
      session_end = now()
    WHERE is_active = true
      AND last_activity < now() - INTERVAL '5 minutes'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_sessions_closed
  FROM closed_sessions;

  -- Build result
  v_result := jsonb_build_object(
    'success', true,
    'sessions_closed', v_sessions_closed,
    'cleanup_time', now(),
    'message', format('Closed %s inactive sessions at midnight', v_sessions_closed)
  );

  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users (edge function will use service role)
GRANT EXECUTE ON FUNCTION midnight_session_cleanup() TO authenticated;

-- Add comment
COMMENT ON FUNCTION midnight_session_cleanup() IS 'Automatically closes all active sessions at midnight except those with activity in last 5 minutes';