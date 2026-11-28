-- Owner removed security onboarding feedback. Preserve existing rows, prohibit new writes.
ALTER TABLE public.feedback_timeline_drafts ADD CONSTRAINT feedback_drafts_no_security_onboarding CHECK (timeline_key <> 'security_onboarding') NOT VALID;
ALTER TABLE public.feedback_timeline_events ADD CONSTRAINT feedback_events_no_security_onboarding CHECK (timeline_key <> 'security_onboarding') NOT VALID;
