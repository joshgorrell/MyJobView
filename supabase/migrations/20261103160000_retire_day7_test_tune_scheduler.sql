-- Issue #440: deploy only with explicit completion choice workflow.
-- Preserve existing Test & Tune grants and historical start timestamps.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-test-tune-starts-daily') THEN
    PERFORM cron.unschedule('process-test-tune-starts-daily');
  END IF;
END $$;

COMMENT ON COLUMN projects.test_tune_started_at IS
  'Authoritative Test & Tune start timestamp; set only on explicit Start Test & Tune choice and never reset on retries.';
