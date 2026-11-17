-- Durable, server-only SMS delivery events. No triggers, cron jobs or sends.
CREATE TABLE public.sms_dispatch_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.sms_dispatch_queue(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'accepted','delivered','failed','retry_scheduled','suppressed','canceled'
  )),
  provider_status text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sms_dispatch_events_dispatch_idx ON public.sms_dispatch_events(dispatch_id, created_at DESC);
ALTER TABLE public.sms_dispatch_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sms_dispatch_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.sms_dispatch_events TO service_role;

-- A single state transition API, callable only by the server role.
-- Compare-and-swap status avoids callbacks overwriting a terminal delivery.
CREATE OR REPLACE FUNCTION public.record_sms_dispatch_result(
  p_dispatch_id uuid,
  p_expected_status text,
  p_new_status text,
  p_provider_sid text DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_retry_at timestamptz DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_organization_id uuid;
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;
  IF p_new_status NOT IN ('accepted','delivered','failed','pending','suppressed','canceled') THEN
    RAISE EXCEPTION 'Invalid SMS status';
  END IF;
  IF NOT (
    (p_expected_status = 'processing' AND p_new_status IN ('accepted','failed','pending','suppressed','canceled'))
    OR (p_expected_status = 'accepted' AND p_new_status IN ('delivered','failed'))
    OR (p_expected_status = 'failed' AND p_new_status = 'delivered')
  ) THEN
    RAISE EXCEPTION 'Invalid SMS status transition';
  END IF;
  IF p_new_status = 'accepted' AND (p_provider_sid IS NULL OR p_provider_sid !~ '^SM[0-9a-fA-F]{32}$') THEN
    RAISE EXCEPTION 'Twilio message SID required';
  END IF;
  IF p_new_status = 'pending' AND p_retry_at IS NULL THEN
    RAISE EXCEPTION 'Retry timestamp required';
  END IF;
  UPDATE public.sms_dispatch_queue
  SET status = p_new_status,
      provider_message_sid = COALESCE(p_provider_sid, provider_message_sid),
      last_error_code = p_error_code,
      next_attempt_at = CASE WHEN p_new_status = 'pending' THEN p_retry_at ELSE next_attempt_at END,
      locked_at = NULL,
      accepted_at = CASE WHEN p_new_status = 'accepted' THEN now() ELSE accepted_at END,
      delivered_at = CASE WHEN p_new_status = 'delivered' THEN now() ELSE delivered_at END,
      updated_at = now()
  WHERE id = p_dispatch_id AND status = p_expected_status
  RETURNING organization_id INTO v_organization_id;

  IF v_organization_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.sms_dispatch_events
    (dispatch_id, organization_id, event_type, provider_status, error_code)
  VALUES
    (p_dispatch_id, v_organization_id,
      CASE WHEN p_new_status = 'pending' THEN 'retry_scheduled' ELSE p_new_status END,
      p_new_status, p_error_code);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.record_sms_dispatch_result(uuid,text,text,text,text,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_sms_dispatch_result(uuid,text,text,text,text,timestamptz)
  TO service_role;
