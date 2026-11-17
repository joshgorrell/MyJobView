-- Correct SMS schema assumptions before any dispatch worker is enabled.
-- The existing contacts schema guarantees phone, not mobile_phone.
-- Replace enqueue function while retaining the same signature and grants.
CREATE OR REPLACE FUNCTION public.enqueue_sms_dispatch(
  p_organization_id uuid,
  p_contact_id uuid,
  p_category text,
  p_event_key text,
  p_body text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_enabled boolean;
  v_id uuid;
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL OR p_contact_id IS NULL THEN
    RAISE EXCEPTION 'Dealer and contact required';
  END IF;
  IF p_category IS NULL OR p_category NOT IN
    ('on_my_way','appointment_reminder','review_request','proposal_notification') THEN
    RAISE EXCEPTION 'Invalid SMS category';
  END IF;
  IF p_event_key IS NULL OR length(p_event_key) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'Invalid idempotency key';
  END IF;
  IF p_body IS NULL OR length(trim(p_body)) NOT BETWEEN 1 AND 1600 THEN
    RAISE EXCEPTION 'Invalid SMS body';
  END IF;

  SELECT CASE p_category
    WHEN 'on_my_way' THEN cfg.on_my_way_enabled
    WHEN 'appointment_reminder' THEN cfg.appointment_reminders_enabled
    WHEN 'review_request' THEN cfg.review_requests_enabled
    WHEN 'proposal_notification' THEN cfg.proposal_notifications_enabled
    ELSE false END
  INTO v_enabled
  FROM public.sms_automation_settings cfg
  WHERE cfg.organization_id = p_organization_id AND cfg.enabled IS TRUE;
  IF v_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'SMS automation disabled for dealer/category';
  END IF;

  SELECT NULLIF(trim(c.phone), '')
  INTO v_phone
  FROM public.contacts c
  WHERE c.id = p_contact_id
    AND c.organization_id = p_organization_id
    AND c.sms_opt_in IS TRUE;

  -- Use a character class to avoid ambiguous SQL/regex backslash escaping.
  IF v_phone IS NULL OR v_phone !~ '^[+][1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'Contact missing consent or valid E.164 number';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.sms_suppressions s
    WHERE s.organization_id = p_organization_id AND s.phone_e164 = v_phone
  ) THEN
    RAISE EXCEPTION 'Contact SMS suppressed';
  END IF;

  INSERT INTO public.sms_dispatch_queue (
    organization_id, contact_id, category, idempotency_key, to_phone, body
  ) VALUES (
    p_organization_id, p_contact_id, p_category, p_event_key, v_phone, p_body
  )
  ON CONFLICT (organization_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT q.id INTO v_id
    FROM public.sms_dispatch_queue q
    WHERE q.organization_id = p_organization_id
      AND q.idempotency_key = p_event_key
      AND q.contact_id = p_contact_id
      AND q.category = p_category
      AND q.to_phone = v_phone
      AND q.body = p_body;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Idempotency key already used for another event';
    END IF;
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_sms_dispatch(uuid,uuid,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_sms_dispatch(uuid,uuid,text,text,text)
  TO service_role;

-- Fix E.164 validation for suppression records without touching existing data.
ALTER TABLE public.sms_suppressions
  DROP CONSTRAINT IF EXISTS sms_suppressions_phone_e164_check;
ALTER TABLE public.sms_suppressions
  ADD CONSTRAINT sms_suppressions_phone_e164_check
  CHECK (phone_e164 ~ '^[+][1-9][0-9]{7,14}$');
