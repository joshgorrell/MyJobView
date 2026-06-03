/*
  # Setup Midnight Session Cleanup Cron Job

  1. Changes
    - Create log table to track cleanup executions
    - Create wrapper function that calls cleanup and logs results
    - Schedule cron job to run daily at midnight

  2. Schedule
    - Runs every day at midnight UTC (0 0 * * *)
    - Automatically cleans up sessions inactive for more than 5 minutes

  3. Monitoring
    - Logs all executions with success/failure status
*/

-- Create a log table to track cleanup executions
CREATE TABLE IF NOT EXISTS session_cleanup_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_time timestamptz NOT NULL DEFAULT now(),
  sessions_closed integer NOT NULL DEFAULT 0,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Create index for querying recent logs
CREATE INDEX IF NOT EXISTS idx_session_cleanup_log_execution_time 
  ON session_cleanup_log(execution_time DESC);

-- Enable RLS
ALTER TABLE session_cleanup_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view cleanup logs
CREATE POLICY "Admins can view cleanup logs"
  ON session_cleanup_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create wrapper function that logs execution
CREATE OR REPLACE FUNCTION execute_midnight_session_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_sessions_closed integer;
BEGIN
  -- Call the cleanup function
  SELECT midnight_session_cleanup() INTO v_result;
  
  -- Extract sessions closed count
  v_sessions_closed := (v_result->>'sessions_closed')::integer;
  
  -- Log successful execution
  INSERT INTO session_cleanup_log (sessions_closed, success)
  VALUES (v_sessions_closed, true);
  
EXCEPTION WHEN OTHERS THEN
  -- Log any errors
  INSERT INTO session_cleanup_log (sessions_closed, success, error_message)
  VALUES (0, false, SQLERRM);
  
  RAISE;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION execute_midnight_session_cleanup() TO authenticated;

-- Unschedule existing job if it exists (ignore errors if it doesn't exist)
DO $$
BEGIN
  PERFORM cron.unschedule('midnight-session-cleanup');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule the midnight session cleanup job
SELECT cron.schedule(
  'midnight-session-cleanup',
  '0 0 * * *',
  'SELECT execute_midnight_session_cleanup();'
);

-- Add helpful comments
COMMENT ON TABLE session_cleanup_log IS 'Tracks executions of the midnight session cleanup job';
COMMENT ON FUNCTION execute_midnight_session_cleanup() IS 'Wrapper function that executes session cleanup and logs results';