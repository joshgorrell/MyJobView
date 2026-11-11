-- Google Calendar was never connected in MJV; verified zero connected profiles,
-- refresh tokens, and calendar event IDs in leads, tasks and discussion_posts.
-- Keep all reminder_date columns: they power MJV's internal follow-up system.
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS google_access_token,
  DROP COLUMN IF EXISTS google_refresh_token,
  DROP COLUMN IF EXISTS google_token_expires_at,
  DROP COLUMN IF EXISTS google_calendar_connected,
  DROP COLUMN IF EXISTS google_calendar_email;

ALTER TABLE public.leads DROP COLUMN IF EXISTS google_calendar_event_id;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS google_calendar_event_id;
ALTER TABLE public.discussion_posts DROP COLUMN IF EXISTS google_calendar_event_id;
