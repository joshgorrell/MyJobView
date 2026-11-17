-- Twilio automation foundation: data only. No triggers, cron jobs, or sends.
-- All new automation categories are disabled by default.
CREATE TABLE IF NOT EXISTS public.sms_automation_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  on_my_way_enabled boolean NOT NULL DEFAULT false,
  appointment_reminders_enabled boolean NOT NULL DEFAULT false,
  review_requests_enabled boolean NOT NULL DEFAULT false,
  proposal_notifications_enabled boolean NOT NULL DEFAULT false,
  quiet_hours_start time NOT NULL DEFAULT '20:00',
  quiet_hours_end time NOT NULL DEFAULT '08:00',
  timezone text NOT NULL DEFAULT 'America/Chicago',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sms_automation_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sms_automation_settings FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.sms_automation_settings TO authenticated;
CREATE POLICY sms_automation_settings_read ON public.sms_automation_settings
  FOR SELECT TO authenticated USING (organization_id = (SELECT get_user_org_id()));
CREATE POLICY sms_automation_settings_admin_insert ON public.sms_automation_settings
  FOR INSERT TO authenticated WITH CHECK (
    organization_id = (SELECT get_user_org_id())
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid())
      AND p.organization_id = sms_automation_settings.organization_id AND p.role IN ('admin','manager'))
  );
CREATE POLICY sms_automation_settings_admin_update ON public.sms_automation_settings
  FOR UPDATE TO authenticated USING (
    organization_id = (SELECT get_user_org_id())
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid())
      AND p.organization_id = sms_automation_settings.organization_id AND p.role IN ('admin','manager'))
  ) WITH CHECK (
    organization_id = (SELECT get_user_org_id())
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid())
      AND p.organization_id = sms_automation_settings.organization_id AND p.role IN ('admin','manager'))
  );

-- Private dispatch ledger. Only server-side service credentials may write.
-- idempotency_key is stable across retries for the same business event.
CREATE TABLE IF NOT EXISTS public.sms_dispatch_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('on_my_way','appointment_reminder','review_request','proposal_notification')),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 255),
  to_phone text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','accepted','delivered','failed','suppressed','canceled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  provider_message_sid text,
  last_error_code text,
  accepted_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS sms_dispatch_due_idx
  ON public.sms_dispatch_queue(next_attempt_at, created_at)
  WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS sms_dispatch_provider_sid_idx
  ON public.sms_dispatch_queue(provider_message_sid)
  WHERE provider_message_sid IS NOT NULL;
ALTER TABLE public.sms_dispatch_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sms_dispatch_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.sms_dispatch_queue TO service_role;

-- Opt-out/suppression records are dealer-specific and apply across categories.
CREATE TABLE IF NOT EXISTS public.sms_suppressions (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('stop','manual','carrier','compliance')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, phone_e164),
  CHECK (phone_e164 ~ '^\\+[1-9][0-9]{7,14}$')
);
ALTER TABLE public.sms_suppressions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sms_suppressions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.sms_suppressions TO service_role;

COMMENT ON TABLE public.sms_dispatch_queue IS
  'Server-only ledger. Never dispatch until consent, suppression, quiet hours, dealer settings, and tenant authorization have been checked.';
