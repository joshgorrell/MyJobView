/*
  Retire the legacy automatic review/satisfaction follow-up cron.
  The authoritative automated Feedback lifecycle is process-feedback-lifecycle-daily.
  Manual Google review requests/resends and manual Feedback resends remain available.
*/
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-review-followup-daily') THEN
    PERFORM cron.unschedule('send-review-followup-daily');
  END IF;
END $$;

UPDATE company_settings
SET auto_review_followup_enabled = false
WHERE auto_review_followup_enabled = true;
