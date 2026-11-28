-- Dormant claim primitives. No runtime EXECUTE grants or scheduler.
ALTER TABLE public.feedback_timeline_deliveries
 ADD COLUMN claim_token uuid,
 ADD COLUMN claimed_at timestamptz,
 ADD COLUMN attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
 ADD CONSTRAINT feedback_delivery_claim_pair CHECK ((claim_token IS NULL) = (claimed_at IS NULL)),
 ADD CONSTRAINT feedback_delivery_claim_required CHECK (status <> 'claimed' OR claim_token IS NOT NULL);

CREATE FUNCTION public.claim_feedback_delivery(p_org uuid,p_delivery uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE token uuid := gen_random_uuid(); claimed uuid;
BEGIN
 UPDATE public.feedback_timeline_deliveries d
 SET status='claimed',claim_token=token,claimed_at=clock_timestamp(),attempt_count=attempt_count+1,reason=NULL
 WHERE d.organization_id=p_org AND d.id=p_delivery AND d.status='planned'
 AND d.due_at<=now() AND d.attempt_count<5
 AND EXISTS (SELECT 1 FROM public.feedback_timeline_events e WHERE e.id=d.event_id
 AND e.organization_id=d.organization_id AND e.cancelled_at IS NULL)
 RETURNING claim_token INTO claimed;
 RETURN claimed;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_feedback_delivery(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Only the holder of the current claim may finalize. Ambiguous outcomes never auto-retry.
CREATE FUNCTION public.finish_feedback_delivery(p_org uuid,p_delivery uuid,p_token uuid,p_status text,p_receipt text,p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF p_status IS NULL OR p_status NOT IN ('sent','failed','uncertain','suppressed') THEN RETURN false; END IF;
 UPDATE public.feedback_timeline_deliveries
 SET status=p_status,provider_message_id=p_receipt,reason=p_reason,claim_token=NULL,claimed_at=NULL
 WHERE organization_id=p_org AND id=p_delivery AND status='claimed' AND claim_token=p_token;
 RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_feedback_delivery(uuid,uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
