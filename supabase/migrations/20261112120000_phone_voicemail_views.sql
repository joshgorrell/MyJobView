-- Per-user read receipts; voicemail ownership and department ACL remain enforced by the Edge Function.
CREATE TABLE IF NOT EXISTS public.phone_voicemail_views (
  organization_id uuid NOT NULL,
  voicemail_id uuid NOT NULL REFERENCES public.voicemail_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (voicemail_id, user_id)
);
CREATE INDEX IF NOT EXISTS phone_voicemail_views_user_org_idx
  ON public.phone_voicemail_views (user_id, organization_id);
ALTER TABLE public.phone_voicemail_views ENABLE ROW LEVEL SECURITY;
-- No direct browser grants: privileged Edge Function validates tenant and department access.
REVOKE ALL ON public.phone_voicemail_views FROM anon, authenticated;
