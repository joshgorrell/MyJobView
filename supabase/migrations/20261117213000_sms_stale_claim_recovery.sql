-- Reconcile abandoned claims without risking duplicate customer texts.
-- Never requeue an unknown-outcome Twilio request automatically.
CREATE OR REPLACE FUNCTION public.reconcile_stale_sms_dispatch(
  p_organization_id uuid,
  p_stale_minutes integer DEFAULT 30,
  p_limit integer DEFAULT 50
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL OR p_stale_minutes < 15 OR p_stale_minutes > 1440 THEN
    RAISE EXCEPTION 'Invalid reconciliation scope';
  END IF;
  WITH stale AS (
    SELECT q.id
    FROM public.sms_dispatch_queue q
    WHERE q.organization_id = p_organization_id
      AND (
        (q.status = 'processing'
          AND q.locked_at < now() - make_interval(mins => p_stale_minutes))
        OR (q.status = 'pending' AND q.attempts >= 5)
      )
    ORDER BY q.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  ), updated AS (
    UPDATE public.sms_dispatch_queue q
    SET status = 'failed',
        last_error_code = CASE WHEN q.status = 'processing'
          THEN 'stale_processing_unknown_outcome' ELSE 'max_attempts_exceeded' END,
        locked_at = NULL,
        updated_at = now()
    FROM stale s WHERE q.id = s.id
    RETURNING q.id, q.organization_id, q.last_error_code
  ), events AS (
    INSERT INTO public.sms_dispatch_events
      (dispatch_id, organization_id, event_type, provider_status, error_code)
    SELECT u.id, u.organization_id, 'failed', 'failed', u.last_error_code
    FROM updated u
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM events;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_stale_sms_dispatch(uuid,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_stale_sms_dispatch(uuid,integer,integer)
  TO service_role;
COMMENT ON FUNCTION public.reconcile_stale_sms_dispatch(uuid,integer,integer)
  IS 'Fail abandoned SMS claims for manual reconciliation; never automatically retry unknown Twilio outcomes.';
