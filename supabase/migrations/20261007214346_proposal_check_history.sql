CREATE TABLE public.proposal_check_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  sent_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  send_key uuid NOT NULL,
  variant text NOT NULL CHECK (variant IN ('sales','owner')),
  recipient_name text NOT NULL,
  recipient_email text NOT NULL,
  sender_name text NOT NULL,
  from_address text NOT NULL,
  reply_to text NOT NULL,
  subject text NOT NULL,
  email_html text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  opened_at timestamptz,
  provider_message_id text,
  open_token text NOT NULL UNIQUE,
  UNIQUE (organization_id,send_key)
);
CREATE INDEX proposal_check_email_history ON public.proposal_check_emails(organization_id,created_at DESC);
ALTER TABLE public.proposal_check_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.proposal_check_emails FROM anon,authenticated;
-- Tokens are server-only; snapshots contain no tracking image.
GRANT SELECT (id,organization_id,sent_by,contact_id,proposal_id,variant,recipient_name,recipient_email,sender_name,from_address,reply_to,subject,email_html,status,created_at,sent_at,opened_at,provider_message_id) ON public.proposal_check_emails TO authenticated;
GRANT ALL ON public.proposal_check_emails TO service_role;
CREATE POLICY proposal_check_history_read ON public.proposal_check_emails FOR SELECT TO authenticated USING (
  organization_id = public.get_user_org_id()
  AND public.flow_has_module_access('reviews')
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=proposal_check_emails.organization_id AND p.is_active
    AND (p.role IN ('admin','owner','super_admin') OR p.can_manage_customer_feedback)
    AND (p.role IN ('admin','owner','super_admin') OR p.can_see_all_review_requests OR proposal_check_emails.sent_by=auth.uid()))
);
COMMENT ON COLUMN public.proposal_check_emails.opened_at IS 'First tracking-image load; image proxies can produce a signal without a human reading the email.';
