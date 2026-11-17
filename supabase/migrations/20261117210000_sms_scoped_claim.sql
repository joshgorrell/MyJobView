-- Scoped claim: a worker configured for one dealer must never claim another dealer's queue.
CREATE OR REPLACE FUNCTION public.claim_sms_dispatch_for_org(p_organization_id uuid, p_limit integer DEFAULT 10)
RETURNS SETOF public.sms_dispatch_queue
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH eligible AS (
    SELECT q.id
    FROM public.sms_dispatch_queue q
    JOIN public.sms_automation_settings cfg ON cfg.organization_id = q.organization_id
    JOIN public.contacts c ON c.id = q.contact_id AND c.organization_id = q.organization_id
    WHERE q.organization_id = p_organization_id
      AND q.status = 'pending' AND q.next_attempt_at <= now() AND q.attempts < 5
      AND cfg.enabled IS TRUE AND c.sms_opt_in IS TRUE
      AND c.phone = q.to_phone
      AND CASE q.category
        WHEN 'on_my_way' THEN cfg.on_my_way_enabled
        WHEN 'appointment_reminder' THEN cfg.appointment_reminders_enabled
        WHEN 'review_request' THEN cfg.review_requests_enabled
        WHEN 'proposal_notification' THEN cfg.proposal_notifications_enabled
        ELSE false END IS TRUE
      AND NOT EXISTS (SELECT 1 FROM public.sms_suppressions s
        WHERE s.organization_id = q.organization_id AND s.phone_e164 = q.to_phone)
      AND NOT (
        CASE WHEN cfg.quiet_hours_start = cfg.quiet_hours_end THEN false
        WHEN cfg.quiet_hours_start < cfg.quiet_hours_end THEN
          (now() AT TIME ZONE cfg.timezone)::time >= cfg.quiet_hours_start
          AND (now() AT TIME ZONE cfg.timezone)::time < cfg.quiet_hours_end
        ELSE (now() AT TIME ZONE cfg.timezone)::time >= cfg.quiet_hours_start
          OR (now() AT TIME ZONE cfg.timezone)::time < cfg.quiet_hours_end END
      )
    ORDER BY q.next_attempt_at, q.created_at
    FOR UPDATE OF q SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 25)
  )
  UPDATE public.sms_dispatch_queue q
  SET status = 'processing', attempts = q.attempts + 1,
      locked_at = now(), updated_at = now()
  FROM eligible e WHERE q.id = e.id
  RETURNING q.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_sms_dispatch_for_org(uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_sms_dispatch_for_org(uuid,integer) TO service_role;
