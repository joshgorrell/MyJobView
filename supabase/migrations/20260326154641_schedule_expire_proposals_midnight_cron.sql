/*
  # Schedule Auto-Expire Proposals Cron Job at Midnight

  1. Summary
    - Schedules the existing `expire_old_proposals()` function to run daily at midnight UTC
    - Uses pg_cron (already enabled in this project) to schedule the job
    - Replaces any existing job with the same name to avoid duplicates
    - The function marks all 'sent' proposals whose `expires_at` is in the past as 'expired'

  2. Schedule
    - Runs every day at midnight UTC (0 0 * * *)

  3. Notes
    - The `expire_old_proposals()` function already exists from migration 20251122042119
    - Also updates expired proposals that are in 'portal' (viewed) status, since those
      should expire too (portal status = customer viewed but not yet approved)
*/

-- Update the expire function to also catch 'portal' status proposals
-- (proposals that have been viewed via portal but not yet acted on)
CREATE OR REPLACE FUNCTION expire_old_proposals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE proposals
  SET status = 'expired'
  WHERE status IN ('sent', 'portal')
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION expire_old_proposals() TO authenticated;
GRANT EXECUTE ON FUNCTION expire_old_proposals() TO service_role;

-- Unschedule any existing job with this name (ignore error if not present)
DO $$
BEGIN
  PERFORM cron.unschedule('expire-proposals-midnight');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule the job to run every day at midnight UTC
SELECT cron.schedule(
  'expire-proposals-midnight',
  '0 0 * * *',
  'SELECT expire_old_proposals();'
);

COMMENT ON FUNCTION expire_old_proposals() IS 'Marks sent/portal proposals as expired when their expires_at timestamp has passed. Scheduled daily at midnight UTC via pg_cron.';
