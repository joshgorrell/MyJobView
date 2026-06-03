/*
  # Schedule Automated Review Follow-up Cron Job

  ## Summary
  Registers a daily pg_cron job that calls the `send-review-followup-job` edge
  function every morning at 9:00 AM UTC. The job only sends emails to
  organizations that have `auto_review_followup_enabled = true`, so it is
  completely safe to schedule even before the feature is turned on.

  ## Details
  - Job name: `send-review-followup-daily`
  - Schedule: 0 9 * * * (every day at 9:00 AM UTC)
  - Calls: /functions/v1/send-review-followup-job via pg_net HTTP POST
  - Pattern mirrors the existing `auto-clock-out-daily` cron job

  ## Notes
  - pg_cron and pg_net extensions must already be enabled (they are).
  - The job is idempotent: follow_up_sent_at is stamped after each send, so
    a record can never receive more than one automated follow-up.
*/

SELECT cron.schedule(
  'send-review-followup-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := (
      SELECT value FROM app_config WHERE key = 'supabase_url'
      UNION ALL
      SELECT current_setting('app.supabase_url', true)
      LIMIT 1
    ) || '/functions/v1/send-review-followup-job',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
