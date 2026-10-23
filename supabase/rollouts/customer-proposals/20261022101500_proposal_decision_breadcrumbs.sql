ALTER TABLE public.proposal_activity DROP CONSTRAINT proposal_activity_activity_type_check;
ALTER TABLE public.proposal_activity ADD CONSTRAINT proposal_activity_activity_type_check CHECK(activity_type IN ('viewed','downloaded','shared','accepted','declined','time_spent','decision_step'));
-- Record an ordered decision path only for authenticated, verified proposal customers.
-- Never trust a supplied proposal ID or actor without checking portal ownership.
CREATE OR REPLACE FUNCTION public.record_proposal_decision_step(p_proposal_id uuid, p_step text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_step IS NULL OR p_step NOT IN ('decline_started','decline_to_changes','decline_to_approval','decline_acknowledged','decline_cancelled','change_request_submitted')
     OR NOT private.proposal_engagement_customer(p_proposal_id) THEN RETURN false; END IF;
  INSERT INTO public.proposal_activity(organization_id,proposal_id,activity_type,viewer_user_id,portal_version_number,metadata)
  SELECT p.organization_id,p.id,'decision_step',auth.uid(),p.current_portal_version,jsonb_build_object('step',p_step,'source','customer_portal') FROM public.proposals p WHERE p.id=p_proposal_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.record_proposal_decision_step(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_proposal_decision_step(uuid,text) TO authenticated;
