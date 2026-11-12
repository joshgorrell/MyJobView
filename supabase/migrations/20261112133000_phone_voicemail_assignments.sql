-- Voicemail workflow ownership. Assignment is distinct from per-user read receipts.
-- All writes must be mediated by a tenant- and department-authorized Edge Function.
ALTER TABLE public.voicemail_messages
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workflow_status text NOT NULL DEFAULT 'new'
    CHECK (workflow_status IN ('new', 'assigned', 'in_progress', 'completed')),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS voicemail_messages_assignment_idx
  ON public.voicemail_messages (organization_id, assigned_user_id, workflow_status, received_at DESC);
CREATE TABLE IF NOT EXISTS public.phone_voicemail_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  voicemail_id uuid NOT NULL REFERENCES public.voicemail_messages(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES public.profiles(id),
  from_department text,
  to_department text,
  from_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  to_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  from_status text,
  to_status text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS phone_voicemail_assignment_history_message_idx
  ON public.phone_voicemail_assignment_history (organization_id, voicemail_id, created_at DESC);
ALTER TABLE public.phone_voicemail_assignment_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.phone_voicemail_assignment_history FROM anon, authenticated;
