-- Record an ordered decision path only for authenticated, verified proposal customers.
-- Never trust a supplied proposal ID or actor without checking portal ownership.
CREATE OR REPLACE FUNCTION public.record_proposal_decision_step(p_proposal_id uuid, p_step text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_step NOT IN ('decline_started','decline_to_changes','decline_to_approval','decline_acknowledged','decline_cancelled','change_request_submitted')
     OR NOT private.proposal_engagement_customer(p_proposal_id) THEN RETURN false; END IF;
  INSERT INTO public.proposal_activity(proposal_id,activity_type,viewer_user_id,metadata)
  VALUES(p_proposal_id,'decision_step',auth.uid(),jsonb_build_object('step',p_step,'source','customer_portal'));
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.record_proposal_decision_step(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_proposal_decision_step(uuid,text) TO authenticated;
