-- Keep verified voicemail notifications moving into AI classification and Flow.
-- Uses the same service-role authenticated pg_cron pattern as existing jobs.
select cron.schedule(
  'drain-phone-voicemail-queue',
  '*/2 * * * *',
  $job$
  select net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/drain-phone-voicemail-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $job$
);
