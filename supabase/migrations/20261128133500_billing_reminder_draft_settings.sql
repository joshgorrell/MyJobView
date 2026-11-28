-- #1286: draft configuration only; no delivery or activation.
CREATE TABLE public.billing_reminder_drafts (
  organization_id uuid PRIMARY KEY,
  minimum_days integer NOT NULL DEFAULT 7 CHECK (minimum_days BETWEEN 1 AND 365),
  templates jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    jsonb_typeof(templates) = 'array' AND pg_column_size(templates) <= 400000
  ),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.billing_reminder_drafts IS
  'Draft configuration only. Not a source of delivery authorization.';
ALTER TABLE public.billing_reminder_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_reminder_drafts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_reminder_drafts TO authenticated;
CREATE POLICY billing_reminder_draft_admin ON public.billing_reminder_drafts
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.organization_id = billing_reminder_drafts.organization_id
      AND p.role IN ('admin','owner')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.organization_id = billing_reminder_drafts.organization_id
      AND p.role IN ('admin','owner')
  ));
-- No seed rows, triggers, scheduler, or enabled flag.
