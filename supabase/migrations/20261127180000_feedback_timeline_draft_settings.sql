-- Issue #1287: configuration only. No delivery, enrollment, cron or activation.
CREATE TABLE public.feedback_timeline_drafts (
  organization_id uuid NOT NULL,
  timeline_key text NOT NULL CHECK (timeline_key IN (
    'proposal_check','lost_opportunity','job_completion','service_completion',
    'security_onboarding','support_completion','test_tune','one_year'
  )),
  steps jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(steps) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, timeline_key)
);
COMMENT ON TABLE public.feedback_timeline_drafts IS
  'Draft configuration only. No worker may use these rows for delivery. Activation requires a separate reviewed release.';
ALTER TABLE public.feedback_timeline_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feedback_timeline_drafts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_timeline_drafts TO authenticated;
CREATE POLICY feedback_timeline_draft_admin ON public.feedback_timeline_drafts
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.organization_id = feedback_timeline_drafts.organization_id
      AND p.role IN ('admin','owner')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.organization_id = feedback_timeline_drafts.organization_id
      AND p.role IN ('admin','owner')
  ));
-- Deliberately no enabled column, seed rows, triggers, or scheduled jobs.
