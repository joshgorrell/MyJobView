-- Depends on 20261019180250_project_punchlist_and_vip_service.sql.
-- Never deletes task, request, visit, or customer records.
BEGIN;
UPDATE public.department_modules SET display_name='Test & Tune' WHERE module_key='punchlist';
ALTER TABLE public.project_tasks ADD COLUMN is_test_and_tune boolean NOT NULL DEFAULT false;
UPDATE public.project_tasks SET is_test_and_tune=true WHERE source='customer' OR legacy_punchlist_id IS NOT NULL;
CREATE TABLE public.test_tune_submissions (
  request_id uuid PRIMARY KEY REFERENCES public.service_requests(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  project_id uuid NOT NULL REFERENCES public.projects(id),
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  submission_id uuid NOT NULL,
  task_ids uuid[] NOT NULL,
  actor_id uuid NOT NULL,
  actor_type text NOT NULL CHECK(actor_type IN ('staff','customer')),
  source text NOT NULL DEFAULT 'test_and_tune',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,submission_id)
);
CREATE INDEX test_tune_submissions_contact ON public.test_tune_submissions(contact_id,organization_id,submitted_at DESC);
CREATE INDEX test_tune_submissions_project ON public.test_tune_submissions(project_id);
CREATE INDEX test_tune_project_adjustments ON public.project_tasks(organization_id,project_id) WHERE is_test_and_tune;
ALTER TABLE public.test_tune_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.test_tune_submissions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.test_tune_submissions TO authenticated;
CREATE POLICY test_tune_submission_staff_read ON public.test_tune_submissions FOR SELECT TO authenticated
 USING(private.punchlist_staff_access(organization_id));

CREATE OR REPLACE FUNCTION public.get_test_tune_workspace()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; result jsonb;
BEGIN
 SELECT organization_id INTO org FROM public.profiles WHERE id=auth.uid() AND is_active;
 IF org IS NULL OR NOT private.punchlist_staff_access(org) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(row_data ORDER BY customer,project_name),'[]'::jsonb) INTO result FROM (
 SELECT coalesce(c.full_name,c.company_name,'Customer') customer,p.name project_name,
 jsonb_build_object('id',p.id,'contact_id',p.contact_id,'name',p.name,'number',p.project_number,
 'customer',coalesce(c.full_name,c.company_name,'Customer'),'end_date',p.substantial_completion_date+90,
 'can_submit',private.project_punchlist_open(p.id),
 'tasks',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,
 'customer_description',t.customer_description,'visibility',t.visibility,'status',t.status,
 'request_id',(SELECT r.request_id FROM public.project_punchlist_requests r JOIN public.service_requests s ON s.id=r.request_id
 WHERE r.task_id=t.id AND r.organization_id=org AND s.organization_id=org ORDER BY s.created_at DESC,r.request_id LIMIT 1)) ORDER BY t.created_at,t.id)
 FROM public.project_tasks t WHERE t.project_id=p.id AND t.organization_id=org AND t.is_test_and_tune),'[]')) row_data
 FROM public.projects p JOIN public.contacts c ON c.id=p.contact_id AND c.organization_id=p.organization_id
 WHERE p.organization_id=org AND p.substantial_completion_date<=CURRENT_DATE
 ) projects;
 RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.add_test_tune_adjustment(p_project_id uuid,p_title text,p_customer_description text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.projects; result uuid;
BEGIN
 SELECT * INTO p FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF p.id IS NULL OR NOT private.punchlist_staff_access(p.organization_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF NOT private.project_punchlist_open(p.id) THEN RAISE EXCEPTION 'Test & Tune expired or suspended; exception review required' USING ERRCODE='42501'; END IF;
 IF nullif(btrim(p_title),'') IS NULL OR length(p_title)>1000 OR length(p_customer_description)>10000 THEN RAISE EXCEPTION 'Enter a valid adjustment title and description'; END IF;
 IF p_customer_description IS NOT NULL AND nullif(btrim(p_customer_description),'') IS NULL THEN RAISE EXCEPTION 'Customer-visible adjustments require a customer-safe description'; END IF;
 INSERT INTO public.project_tasks(project_id,organization_id,title,source,visibility,customer_description,created_by,is_test_and_tune)
 VALUES(p.id,p.organization_id,btrim(p_title),'manual',CASE WHEN p_customer_description IS NULL THEN 'internal' ELSE 'customer_visible' END,btrim(p_customer_description),auth.uid(),true) RETURNING id INTO result;
 RETURN result;
END; $$;

-- Portal-created adjustments are always T&T; ordinary project scope remains separate.
CREATE OR REPLACE FUNCTION private.mark_customer_test_tune()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.is_test_and_tune THEN NEW.is_test_and_tune=true; END IF;
 IF NEW.source='customer' OR NEW.legacy_punchlist_id IS NOT NULL THEN NEW.is_test_and_tune=true; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.mark_customer_test_tune() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER mark_customer_test_tune BEFORE INSERT OR UPDATE ON public.project_tasks FOR EACH ROW EXECUTE FUNCTION private.mark_customer_test_tune();

CREATE OR REPLACE FUNCTION public.request_project_punchlist_visit(p_project_id uuid,p_task_ids uuid[],p_submission_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.projects; c public.contacts; result uuid; ids uuid[]; portal boolean; receipt public.test_tune_submissions; prior public.service_requests;
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
 IF (SELECT count(*) FROM public.project_tasks t WHERE t.id=ANY(ids) AND t.project_id=p.id AND t.organization_id=p.organization_id AND t.status='open'
 AND (NOT portal OR (t.visibility='customer_visible' AND nullif(btrim(t.customer_description),'') IS NOT NULL)))<>cardinality(ids) THEN RAISE EXCEPTION 'Invalid item selection' USING ERRCODE='42501'; END IF;
 -- Ordinary in-project scope can still request billable visits after T&T expires.
 -- Complimentary adjustment requests cannot bypass the entitlement gate as staff.
 IF (portal OR EXISTS(SELECT 1 FROM public.project_tasks WHERE id=ANY(ids) AND is_test_and_tune)) AND NOT private.project_punchlist_open(p.id) THEN
  RAISE EXCEPTION 'Project Punchlist is now view-only; Test & Tune exception review required' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM public.project_punchlist_requests WHERE task_id=ANY(ids))
 OR EXISTS(SELECT 1 FROM public.project_tasks t JOIN public.punchlist_tasks l ON l.id=t.legacy_punchlist_id WHERE t.id=ANY(ids) AND l.service_request_id IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.work_order_tasks t JOIN public.work_orders w ON w.id=t.work_order_id WHERE t.project_task_id=ANY(ids) AND w.status NOT IN ('completed','cancelled') AND t.status NOT IN ('completed','cancelled')) THEN RAISE EXCEPTION 'An item is already requested or assigned. Refresh the list.'; END IF;
 SELECT * INTO c FROM public.contacts WHERE id=p.contact_id AND organization_id=p.organization_id;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Project customer unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO public.service_requests(organization_id,contact_id,customer_name,customer_phone,customer_email,job_location_address,job_location_city,job_location_state,job_location_zip,job_description,billable_type,billable_by,priority,status,source_type,request_type,project_id,portal_submission_id,created_by)
 VALUES(p.organization_id,p.contact_id,coalesce(c.full_name,c.company_name,'Customer'),c.phone,c.email,coalesce(c.street_address,''),c.city,c.state,c.zip_code,
 'Test & Tune visit ('||cardinality(ids)||' items) — '||p.name,'billable','admin','normal','open','punchlist','project',p.id,p_submission_id,CASE WHEN portal THEN NULL ELSE auth.uid() END) RETURNING id INTO result;
 INSERT INTO public.project_punchlist_requests(request_id,task_id,organization_id) SELECT result,x,p.organization_id FROM unnest(ids) x;
 INSERT INTO public.test_tune_submissions(request_id,organization_id,project_id,contact_id,submission_id,task_ids,actor_id,actor_type)
 VALUES(result,p.organization_id,p.id,p.contact_id,p_submission_id,ids,auth.uid(),CASE WHEN portal THEN 'customer' ELSE 'staff' END);
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.get_test_tune_workspace(),public.add_test_tune_adjustment(uuid,text,text),public.request_project_punchlist_visit(uuid,uuid[],uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_test_tune_workspace(),public.add_test_tune_adjustment(uuid,text,text),public.request_project_punchlist_visit(uuid,uuid[],uuid) TO authenticated;
ALTER TABLE public.contacts ADD COLUMN test_tune_submission_updates_enabled boolean NOT NULL DEFAULT true;
CREATE OR REPLACE FUNCTION public.set_test_tune_submission_updates(p_contact_id uuid,p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;
BEGIN
 SELECT organization_id INTO org FROM public.contacts WHERE id=p_contact_id;
 IF org IS NULL OR NOT private.punchlist_portal_identity(p_contact_id,org) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_enabled IS NULL THEN RAISE EXCEPTION 'Choose an update preference'; END IF;
 UPDATE public.contacts SET test_tune_submission_updates_enabled=p_enabled WHERE id=p_contact_id AND organization_id=org;
END; $$;
REVOKE ALL ON FUNCTION public.set_test_tune_submission_updates(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_test_tune_submission_updates(uuid,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_customer_support(p_contact_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; result jsonb;
BEGIN
 SELECT organization_id INTO org FROM public.contacts WHERE id=p_contact_id;
 IF org IS NULL OR NOT (private.punchlist_portal_identity(p_contact_id,org) OR private.punchlist_staff_identity(org)) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('organization_id',org,'vip_service_access',private.vip_service_entitled(p_contact_id,org),
 'submission_updates_enabled',(SELECT test_tune_submission_updates_enabled FROM public.contacts WHERE id=p_contact_id AND organization_id=org),
 'submission_updates',coalesce((SELECT jsonb_agg(jsonb_build_object('request_id',r.request_id,'project_id',r.project_id,'item_count',cardinality(r.task_ids),'submitted_at',r.submitted_at) ORDER BY r.submitted_at DESC)
 FROM public.test_tune_submissions r JOIN public.contacts c ON c.id=r.contact_id AND c.organization_id=r.organization_id
 WHERE r.contact_id=p_contact_id AND r.organization_id=org AND c.test_tune_submission_updates_enabled),'[]'),
 'projects',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'number',p.project_number,'end_date',p.substantial_completion_date+90,'days_remaining',greatest(0,p.substantial_completion_date+90-CURRENT_DATE),'can_submit',private.project_punchlist_open(p.id),
 'tasks',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'description',t.customer_description,'status',t.status,'progress',t.progress_status,'source',t.source,
 'requested',EXISTS(SELECT 1 FROM public.project_punchlist_requests r JOIN public.service_requests s ON s.id=r.request_id WHERE r.task_id=t.id) OR EXISTS(SELECT 1 FROM public.punchlist_tasks l WHERE l.id=t.legacy_punchlist_id AND l.service_request_id IS NOT NULL AND l.status<>'completed'),
 'photos',coalesce((SELECT jsonb_agg(f.storage_path) FROM public.portal_support_photos f WHERE f.task_id=t.id),'[]'),'legacy_photos',coalesce((SELECT jsonb_agg(f.photo_url) FROM public.punchlist_task_photos f WHERE f.task_id=t.legacy_punchlist_id),'[]')) ORDER BY t.sort_order,t.created_at)
 FROM public.project_tasks t WHERE t.project_id=p.id AND t.organization_id=org AND t.visibility='customer_visible' AND nullif(btrim(t.customer_description),'') IS NOT NULL),'[]')) ORDER BY p.substantial_completion_date DESC)
 FROM public.projects p WHERE p.contact_id=p_contact_id AND p.organization_id=org AND p.substantial_completion_date<=CURRENT_DATE),'[]'),
 'requests',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'description',s.job_description,'status',s.status,'created_at',s.created_at,
 'photos',coalesce((SELECT jsonb_agg(f.storage_path) FROM public.portal_support_photos f WHERE f.request_id=s.id),'[]')) ORDER BY s.created_at DESC)
 FROM public.service_requests s WHERE s.contact_id=p_contact_id AND s.organization_id=org AND s.source_type='customer_portal' AND s.request_type='service'),'[]'),
 'legacy_items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'description',coalesce(nullif(btrim(l.details),''),l.title),'status',l.status)) FROM public.punchlist_tasks l
 WHERE l.contact_id=p_contact_id AND l.organization_id=org AND NOT EXISTS(SELECT 1 FROM public.project_tasks t WHERE t.legacy_punchlist_id=l.id)),'[]')) INTO result;
 RETURN result;
END; $$;

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AND NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='project_punchlist_requests') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.project_punchlist_requests;
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
