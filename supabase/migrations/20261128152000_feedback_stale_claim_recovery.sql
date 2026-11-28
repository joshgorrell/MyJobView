-- Stable provider identity for a logical delivery, independent of claim attempts.
ALTER TABLE public.feedback_timeline_deliveries
 ADD COLUMN provider_idempotency_key text GENERATED ALWAYS AS ('mjv-feedback-' || id::text) STORED,
 ADD CONSTRAINT feedback_delivery_provider_key_unique UNIQUE(provider_idempotency_key);

-- Dormant recovery: a crashed worker may have sent successfully. Quarantine,
-- never automatically return an ambiguous claim to the planned queue.
CREATE FUNCTION public.quarantine_stale_feedback_claims(p_org uuid,p_limit integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE affected integer;
BEGIN
 WITH stale AS (
 SELECT id FROM public.feedback_timeline_deliveries
 WHERE organization_id=p_org AND status='claimed'
 AND claimed_at <= now()-interval '30 minutes'
 ORDER BY claimed_at,id
 LIMIT greatest(0,least(coalesce(p_limit,0),100))
 FOR UPDATE SKIP LOCKED
 )
 UPDATE public.feedback_timeline_deliveries d
 SET status='uncertain',reason='stale_claim_requires_provider_reconciliation',
 claim_token=NULL,claimed_at=NULL
 FROM stale WHERE d.id=stale.id AND d.organization_id=p_org AND d.status='claimed';
 GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN affected;
END;
$$;
REVOKE ALL ON FUNCTION public.quarantine_stale_feedback_claims(uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
