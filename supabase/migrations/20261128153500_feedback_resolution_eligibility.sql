-- Read-only final-source guards; no sender or trigger changes.
CREATE FUNCTION public.feedback_resolution_suppression(p_org uuid,p_source uuid,p_timeline text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE r record;
BEGIN
 IF p_timeline='service_completion' THEN
 SELECT status,request_type,contact_id,work_order_id INTO r FROM public.service_requests
 WHERE id=p_source AND organization_id=p_org;
 IF NOT FOUND THEN RETURN 'missing_source'; END IF;
 IF r.status IS DISTINCT FROM 'closed' OR r.request_type IS DISTINCT FROM 'service' OR r.contact_id IS NULL
 THEN RETURN 'service_ineligible'; END IF;
 IF EXISTS (SELECT 1 FROM public.work_orders w WHERE w.id=r.work_order_id
 AND w.organization_id=p_org AND w.feedback_email_sent IS TRUE)
 THEN RETURN 'legacy_work_order_feedback_exists'; END IF;
 ELSIF p_timeline='support_completion' THEN
 SELECT status,is_support_request,contact_id,completed_at INTO r FROM public.tasks
 WHERE id=p_source AND organization_id=p_org;
 IF NOT FOUND THEN RETURN 'missing_source'; END IF;
 IF r.status IS DISTINCT FROM 'completed' OR r.is_support_request IS DISTINCT FROM true
 OR r.contact_id IS NULL OR r.completed_at IS NULL THEN RETURN 'support_ineligible'; END IF;
 ELSE RETURN 'invalid_candidate';
 END IF;
 RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.feedback_resolution_suppression(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.feedback_resolution_suppression(uuid,uuid,text) TO service_role;
