/*
  # Schedule Auto-Archive Proposals Cron Job

  1. Changes
    - Create wrapper function that calls auto-archive and logs results
    - Schedule cron job to run daily at 1 AM UTC

  2. Schedule
    - Runs every day at 1 AM UTC (0 1 * * *)
    - Automatically archives declined proposals older than configured threshold

  3. Monitoring
    - Logs all executions via proposal_archive_log table (already created)
*/

-- Create wrapper function that executes the auto-archive
CREATE OR REPLACE FUNCTION execute_auto_archive_declined_proposals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Call the auto-archive function
  SELECT auto_archive_declined_proposals() INTO v_result;
  
  -- The function already logs to proposal_archive_log internally
  -- This wrapper just provides a consistent interface for cron
  
EXCEPTION WHEN OTHERS THEN
  -- Log any unexpected errors
  INSERT INTO proposal_archive_log (
    executed_at,
    proposals_archived,
    success,
    error_message
  ) VALUES (
    now(),
    0,
    false,
    SQLERRM
  );
  
  RAISE;
END;
$$;

-- Grant execute permission to service_role for cron
GRANT EXECUTE ON FUNCTION execute_auto_archive_declined_proposals() TO service_role;

-- Unschedule existing job if it exists (ignore errors if it doesn't exist)
DO $$
BEGIN
  PERFORM cron.unschedule('auto-archive-declined-proposals');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule the auto-archive job to run daily at 1 AM UTC
SELECT cron.schedule(
  'auto-archive-declined-proposals',
  '0 1 * * *',
  'SELECT execute_auto_archive_declined_proposals();'
);

-- Add helpful comments
COMMENT ON FUNCTION execute_auto_archive_declined_proposals() IS 'Wrapper function that executes auto-archive of old declined proposals and logs results';