-- Inert event foundation. No producers, backfill, enrollment, scheduler or email delivery.
CREATE TABLE public.feedback_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  timeline_key text NOT NULL CHECK (timeline_key IN (
    'proposal_check','lost_opportunity','job_completion','service_completion',
    'security_onboarding','support_completion','test_tune','one_year'
  )),
  source_id uuid NOT NULL,
  occurrence_key text NOT NULL CHECK (length(occurrence_key) BETWEEN 1 AND 200),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancellation_reason text,
  UNIQUE (organization_id, timeline_key, source_id, occurrence_key),
  CHECK ((cancelled_at IS NULL) = (cancellation_reason IS NULL))
);
COMMENT ON TABLE public.feedback_timeline_events IS
  'Inert event ledger. No delivery or enrollment permitted until separate owner-approved activation.';
ALTER TABLE public.feedback_timeline_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feedback_timeline_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.feedback_timeline_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.feedback_timeline_events TO service_role;
CREATE POLICY feedback_timeline_event_admin_read ON public.feedback_timeline_events
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.organization_id = feedback_timeline_events.organization_id
      AND p.role IN ('admin','owner')
  ));
CREATE INDEX feedback_timeline_events_org_recorded_idx
  ON public.feedback_timeline_events (organization_id, recorded_at DESC, id);
