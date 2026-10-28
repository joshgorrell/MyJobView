-- Preserve the latest atomic request origin classification and reject removed drafts.
BEGIN;
CREATE OR REPLACE FUNCTION public.request_project_punchlist_visit(p_project_id uuid,p_task_ids uuid[],p_submission_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.projects; c public.contacts; result uuid; ids uuid[]; portal boolean; receipt public.test_tune_submissions; prior public.service_requests; all_tune boolean; any_tune boolean;
BEGIN
 SELECT * INTO p FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
 portal=private.punchlist_portal_identity(p.contact_id,p.organization_id);
 IF NOT (portal OR private.punchlist_staff_access(p.organization_id)) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT array_agg(DISTINCT x ORDER BY x) INTO ids FROM unnest(p_task_ids) x WHERE x IS NOT NULL;
 IF coalesce(cardinality(ids),0)=0 OR p_submission_id IS NULL THEN RAISE EXCEPTION 'Select at least one item'; END IF;
 -- Serialize across projects too: a reused submission key may never resolve to another payload.
 PERFORM pg_advisory_xact_lock(hashtextextended(p.organization_id::text||p_submission_id::text,0));
 SELECT * INTO receipt FROM public.test_tune_submissions WHERE organization_id=p.organization_id AND submission_id=p_submission_id;
 IF receipt.request_id IS NOT NULL THEN
  IF receipt.project_id<>p.id OR receipt.contact_id<>p.contact_id OR receipt.task_ids<>ids OR receipt.actor_id<>auth.uid() THEN RAISE EXCEPTION 'Submission reference already used for a different selection' USING ERRCODE='42501'; END IF;
  RETURN receipt.request_id;
 END IF;
 -- Backwards-compatible retries for requests submitted before the receipt ledger existed.
 SELECT * INTO prior FROM public.service_requests WHERE contact_id=p.contact_id AND organization_id=p.organization_id AND portal_submission_id=p_submission_id;
 IF prior.id IS NOT NULL THEN
  IF prior.project_id IS DISTINCT FROM p.id OR (SELECT array_agg(task_id ORDER BY task_id) FROM public.project_punchlist_requests WHERE request_id=prior.id) IS DISTINCT FROM ids THEN RAISE EXCEPTION 'Submission reference already used'; END IF;
  RETURN prior.id;
 END IF;
 PERFORM 1 FROM public.project_tasks WHERE id=ANY(ids) ORDER BY id FOR UPDATE;
 IF (SELECT count(*) FROM public.project_tasks t WHERE t.id=ANY(ids) AND t.project_id=p.id AND t.organization_id=p.organization_id AND t.status='open' AND t.customer_draft_removed_at IS NULL
 AND (NOT portal OR (t.visibility='customer_visible' AND nullif(btrim(t.customer_description),'') IS NOT NULL)))<>cardinality(ids) THEN RAISE EXCEPTION 'Invalid item selection' USING ERRCODE='42501'; END IF;
 SELECT bool_and(is_test_and_tune),bool_or(is_test_and_tune) INTO all_tune,any_tune FROM public.project_tasks WHERE id=ANY(ids);
 IF any_tune AND NOT all_tune THEN RAISE EXCEPTION 'Select Test & Tune adjustments separately from ordinary project scope'; END IF;
 -- Ordinary in-project scope can still request billable visits after T&T expires.
 -- Complimentary adjustment requests cannot bypass the entitlement gate as staff.
 IF (portal OR any_tune) AND NOT private.project_punchlist_open(p.id) THEN
  RAISE EXCEPTION 'Project Punchlist is now view-only; Test & Tune exception review required' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM public.project_punchlist_requests WHERE task_id=ANY(ids))
 OR EXISTS(SELECT 1 FROM public.project_tasks t JOIN public.punchlist_tasks l ON l.id=t.legacy_punchlist_id WHERE t.id=ANY(ids) AND l.service_request_id IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.work_order_tasks t JOIN public.work_orders w ON w.id=t.work_order_id WHERE t.project_task_id=ANY(ids) AND w.status NOT IN ('completed','cancelled') AND t.status NOT IN ('completed','cancelled')) THEN RAISE EXCEPTION 'An item is already requested or assigned. Refresh the list.'; END IF;
 SELECT * INTO c FROM public.contacts WHERE id=p.contact_id AND organization_id=p.organization_id;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Project customer unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO public.service_requests(organization_id,contact_id,customer_name,customer_phone,customer_email,job_location_address,job_location_city,job_location_state,job_location_zip,job_description,billable_type,billable_by,priority,status,source_type,request_type,project_id,portal_submission_id,created_by,is_test_and_tune)
 VALUES(p.organization_id,p.contact_id,coalesce(c.full_name,c.company_name,'Customer'),c.phone,c.email,coalesce(c.street_address,''),c.city,c.state,c.zip_code,
 (CASE WHEN all_tune THEN 'Test & Tune visit (' ELSE 'Project Punchlist visit (' END)||cardinality(ids)||' items) — '||p.name,'billable','admin','normal','open','punchlist','project',p.id,p_submission_id,CASE WHEN portal THEN NULL ELSE auth.uid() END,all_tune) RETURNING id INTO result;
 INSERT INTO public.project_punchlist_requests(request_id,task_id,organization_id) SELECT result,x,p.organization_id FROM unnest(ids) x;
 INSERT INTO public.test_tune_submissions(request_id,organization_id,project_id,contact_id,submission_id,task_ids,actor_id,actor_type,source)
 VALUES(result,p.organization_id,p.id,p.contact_id,p_submission_id,ids,auth.uid(),CASE WHEN portal THEN 'customer' ELSE 'staff' END,CASE WHEN all_tune THEN 'test_and_tune' ELSE 'project_punchlist' END);
 RETURN result;
END; $$;
COMMIT;
