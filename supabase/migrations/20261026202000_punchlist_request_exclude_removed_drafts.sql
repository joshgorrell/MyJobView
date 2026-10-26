-- Prevent stale clients and staff from requesting service for removed customer drafts.
BEGIN;
CREATE OR REPLACE FUNCTION public.request_project_punchlist_visit(p_project_id uuid,p_task_ids uuid[],p_submission_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.projects; c public.contacts; result uuid; ids uuid[]; portal boolean;
BEGIN
 SELECT * INTO p FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
 portal=private.punchlist_portal_identity(p.contact_id,p.organization_id);
 IF NOT (portal OR private.punchlist_staff_access(p.organization_id)) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT id INTO result FROM public.service_requests WHERE contact_id=p.contact_id AND organization_id=p.organization_id AND portal_submission_id=p_submission_id;
 IF result IS NOT NULL THEN RETURN result; END IF;
 IF portal AND NOT private.project_punchlist_open(p.id) THEN RAISE EXCEPTION 'Project Punchlist is now view-only' USING ERRCODE='42501'; END IF;
 SELECT array_agg(DISTINCT x) INTO ids FROM unnest(p_task_ids) x WHERE x IS NOT NULL;
 IF coalesce(cardinality(ids),0)=0 OR p_submission_id IS NULL THEN RAISE EXCEPTION 'Select at least one item'; END IF;
 IF (SELECT count(*) FROM public.project_tasks t WHERE t.id=ANY(ids) AND t.project_id=p.id AND t.organization_id=p.organization_id AND t.status='open' AND t.customer_draft_removed_at IS NULL
 AND (NOT portal OR (t.visibility='customer_visible' AND nullif(btrim(t.customer_description),'') IS NOT NULL)))<>cardinality(ids) THEN RAISE EXCEPTION 'Invalid item selection' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.project_punchlist_requests r JOIN public.service_requests s ON s.id=r.request_id WHERE r.task_id=ANY(ids) AND s.status NOT IN ('closed','cancelled'))
 OR EXISTS(SELECT 1 FROM public.project_tasks t JOIN public.punchlist_tasks l ON l.id=t.legacy_punchlist_id WHERE t.id=ANY(ids) AND l.service_request_id IS NOT NULL AND l.status<>'completed')
 OR EXISTS(SELECT 1 FROM public.work_order_tasks t JOIN public.work_orders w ON w.id=t.work_order_id WHERE t.project_task_id=ANY(ids) AND w.status NOT IN ('completed','cancelled') AND t.status NOT IN ('completed','cancelled')) THEN RAISE EXCEPTION 'An item is already requested or assigned. Refresh the list.'; END IF;
 SELECT * INTO c FROM public.contacts WHERE id=p.contact_id AND organization_id=p.organization_id;
 INSERT INTO public.service_requests(organization_id,contact_id,customer_name,customer_phone,customer_email,job_location_address,job_location_city,job_location_state,job_location_zip,job_description,billable_type,billable_by,priority,status,source_type,request_type,project_id,portal_submission_id)
 VALUES(p.organization_id,p.contact_id,coalesce(c.full_name,c.company_name,'Customer'),c.phone,c.email,coalesce(c.street_address,''),c.city,c.state,c.zip_code,
 'Project Punchlist visit ('||cardinality(ids)||' items) — '||p.name,'billable','admin','normal','open','punchlist','project',p.id,p_submission_id) RETURNING id INTO result;
 INSERT INTO public.project_punchlist_requests(request_id,task_id,organization_id) SELECT result,x,p.organization_id FROM unnest(ids) x;
 RETURN result;
END; $$;

COMMIT;
