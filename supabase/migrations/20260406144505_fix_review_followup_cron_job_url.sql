/*
  # Fix Review Follow-up Cron Job URL

  ## Summary
  Replaces the incorrectly scheduled cron job from the previous migration with
  a correctly configured one that uses `current_setting('app.settings.supabase_url')`
  — the same pattern used by the existing auto-clock-out-scheduler and
  midnight-session-cleanup jobs.

  ## Details
  - Job name: send-review-followup-daily
  - Schedule: 0 9 * * * (every day at 9:00 AM UTC = ~4 AM CDT)
  - Calls: /functions/v1/send-review-followup-job
*/

SELECT cron.unschedule('send-review-followup-daily');

SELECT cron.schedule(
  'send-review-followup-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-review-followup-job',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
