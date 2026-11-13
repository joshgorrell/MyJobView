-- Renew active RingCentral voicemail subscriptions before their 7-day expiry.
-- Existing Supabase scheduled jobs use these project settings for authenticated Edge calls.
select cron.schedule(
  'ringcentral-voicemail-subscription-renewal',
  '0 10 * * *',
  $job$
  select net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/ringcentral-subscription-renewal',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $job$
);
