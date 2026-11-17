-- Dealer-specific SMS template drafts. The dispatcher is NOT wired to these templates yet.
CREATE TABLE IF NOT EXISTS public.sms_message_templates (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('appointment_reminder','review_request','proposal_notification')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1600),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, category)
);
ALTER TABLE public.sms_message_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sms_message_templates FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.sms_message_templates TO authenticated;
CREATE POLICY sms_message_templates_read ON public.sms_message_templates
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.get_user_org_id()));
CREATE POLICY sms_message_templates_insert ON public.sms_message_templates
  FOR INSERT TO authenticated WITH CHECK (
    organization_id = (SELECT public.get_user_org_id())
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid())
      AND p.organization_id = sms_message_templates.organization_id
      AND p.role IN ('admin','manager'))
  );
CREATE POLICY sms_message_templates_update ON public.sms_message_templates
  FOR UPDATE TO authenticated USING (
    organization_id = (SELECT public.get_user_org_id())
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid())
      AND p.organization_id = sms_message_templates.organization_id
      AND p.role IN ('admin','manager'))
  ) WITH CHECK (
    organization_id = (SELECT public.get_user_org_id())
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid())
      AND p.organization_id = sms_message_templates.organization_id
      AND p.role IN ('admin','manager'))
  );
