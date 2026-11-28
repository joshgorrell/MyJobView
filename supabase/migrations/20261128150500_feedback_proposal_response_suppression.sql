-- Read-only suppression check for proposal-related candidate events.
-- Unknown or missing sources fail closed. No changes to existing delivery.
CREATE OR REPLACE FUNCTION public.feedback_proposal_suppression(
 p_org uuid,p_proposal uuid,p_timeline text,p_occurred_at timestamptz
) RETURNS text LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE p record;
BEGIN
 IF p_timeline IS NULL OR p_timeline NOT IN ('proposal_check','lost_opportunity')
    OR p_occurred_at IS NULL THEN RETURN 'invalid_candidate'; END IF;
 SELECT status,decline_reason,declined_by INTO p FROM public.proposals
 WHERE id=p_proposal AND organization_id=p_org;
 IF NOT FOUND THEN RETURN 'missing_source'; END IF;
 IF p.status IN ('approved','approved_pending_action','cancelled','draft') THEN RETURN 'proposal_ineligible'; END IF;
 IF p_timeline='proposal_check' THEN
   IF p.status NOT IN ('sent','viewed') OR p.status IS NULL THEN RETURN 'proposal_ineligible'; END IF;
   IF EXISTS (SELECT 1 FROM public.proposal_check_emails e
     JOIN public.proposal_check_events v ON v.email_id=e.id AND v.organization_id=e.organization_id
     WHERE e.organization_id=p_org AND e.proposal_id=p_proposal AND e.status='sent'
       AND v.created_at>=p_occurred_at AND v.kind IN ('interaction','message')
       AND v.suspected_automated IS FALSE) THEN RETURN 'customer_responded'; END IF;
 ELSE
   IF p.status IS DISTINCT FROM 'declined' THEN RETURN 'proposal_ineligible'; END IF;
   IF p.declined_by='customer' AND p.decline_reason IS NOT NULL
      AND p.decline_reason NOT IN ('unknown','no_response') THEN RETURN 'customer_responded'; END IF;
   IF EXISTS (SELECT 1 FROM public.proposal_loss_feedback f
     WHERE f.organization_id=p_org AND f.proposal_id=p_proposal
       AND f.source IN ('phone','email','in_person')) THEN RETURN 'customer_responded'; END IF;
   IF EXISTS (SELECT 1 FROM public.lost_review_details l
     WHERE l.organization_id=p_org AND l.proposal_id=p_proposal
       AND l.responded_at IS NOT NULL) THEN RETURN 'customer_responded'; END IF;
 END IF;
 RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.feedback_proposal_suppression(uuid,uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.feedback_proposal_suppression(uuid,uuid,text,timestamptz) TO service_role;
