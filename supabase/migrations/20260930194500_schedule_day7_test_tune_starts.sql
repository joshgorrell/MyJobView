/*
  Day-7 Test & Tune lifecycle scheduler.
  The processor is idempotent on projects.test_tune_started_at and reuses any active
  Punchlist access created intentionally from Punchlist or the invoice workflow.
*/
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-test-tune-starts-daily') THEN
    PERFORM cron.unschedule('process-test-tune-starts-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'process-test-tune-starts-daily',
  '15 13 * * *',
  $cron$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/process-test-tune-starts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $cron$
);

COMMENT ON COLUMN projects.test_tune_started_at IS
  'Authoritative Test & Tune start timestamp. Normal lifecycle begins 7 days after substantial completion; intentional earlier Punchlist/invoice invites may grant access without changing this timestamp.';
