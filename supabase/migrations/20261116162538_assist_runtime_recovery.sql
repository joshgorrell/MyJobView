-- A verified runtime crash/restart must invalidate readiness and queue a new canary-backed activation.
CREATE FUNCTION assist_private.requeue_runtime(p_org uuid,p_generation bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE assist_private.activation_jobs j SET generation=j.generation+1,state='pending',attempts=0,
 next_attempt_at=now(),lease_token=NULL,lease_until=NULL,error_code='provider_unavailable',updated_at=now()
 WHERE j.organization_id=p_org AND j.generation=p_generation AND j.state='ready' AND j.desired_enabled
 AND EXISTS(SELECT 1 FROM assist_private.dealer_preferences p JOIN public.organizations o ON o.id=p.organization_id
   WHERE p.organization_id=p_org AND p.enabled AND o.is_active);
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE assist_private.dealer_setup SET enrollment_enabled=false WHERE organization_id=p_org;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION assist_private.requeue_runtime(uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION assist_private.requeue_runtime(uuid,bigint) TO service_role;
CREATE FUNCTION public.requeue_assist_runtime(p_organization_id uuid,p_generation bigint)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT assist_private.requeue_runtime(p_organization_id,p_generation);
$$;
REVOKE ALL ON FUNCTION public.requeue_assist_runtime(uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_assist_runtime(uuid,bigint) TO service_role;
