-- Project tasks are the canonical project punchlist. Portal reads use an explicit
-- projection: internal titles, instructions, visit notes and history never cross it.
BEGIN;
ALTER TABLE public.project_tasks ADD COLUMN customer_description text;
ALTER TABLE public.project_tasks ADD COLUMN legacy_punchlist_id uuid UNIQUE REFERENCES public.punchlist_tasks(id) ON DELETE RESTRICT;
ALTER TABLE public.recurring_subscriptions ADD COLUMN is_complimentary boolean NOT NULL DEFAULT false;
ALTER TABLE public.recurring_subscriptions ADD COLUMN IF NOT EXISTS comped_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.recurring_subscriptions ADD COLUMN IF NOT EXISTS comped_at timestamptz;
ALTER TABLE public.recurring_subscriptions ADD COLUMN IF NOT EXISTS comp_reason text;
UPDATE public.recurring_subscriptions SET is_complimentary=true,custom_amount=0,auto_invoice=false,auto_send=false,auto_renew=false
WHERE comped_by IS NOT NULL AND comped_at IS NOT NULL AND end_date IS NOT NULL;

ALTER TABLE public.service_requests ADD COLUMN portal_submission_id uuid;
CREATE UNIQUE INDEX service_request_portal_submission ON public.service_requests(organization_id,contact_id,portal_submission_id) WHERE portal_submission_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.project_punchlist_open(p_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.projects p WHERE p.id=p_project
   AND CURRENT_DATE BETWEEN p.substantial_completion_date AND p.substantial_completion_date+90
   AND NOT EXISTS(SELECT 1 FROM public.punchlist_access_grants g WHERE g.project_id=p.id
     AND g.contact_id=p.contact_id AND g.organization_id=p.organization_id
     AND g.access_type='test_and_tune' AND g.status='suspended'));
$$;
CREATE OR REPLACE FUNCTION private.vip_service_entitled(p_contact uuid,p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.recurring_subscriptions s JOIN public.recurring_plans p ON p.id=s.plan_id
 WHERE s.contact_id=p_contact AND s.organization_id=p_org AND p.organization_id=p_org AND p.plan_type='vip_plan'
 AND s.status='active' AND s.start_date<=CURRENT_DATE AND (s.end_date IS NULL OR s.end_date>=CURRENT_DATE)
 AND ((s.is_complimentary AND s.end_date>=CURRENT_DATE) OR (NOT s.is_complimentary AND s.next_billing_date>=CURRENT_DATE)));
$$;
REVOKE ALL ON FUNCTION private.project_punchlist_open(uuid),private.vip_service_entitled(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.project_punchlist_open(uuid),private.vip_service_entitled(uuid,uuid) TO authenticated;

-- Existing same-org policies alone are not sufficient for portal users with profiles.
-- Portal access is through the safe functions below, never raw internal task rows.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['project_tasks','task_photos','task_history','work_order_task_updates','work_order_task_completions','service_requests'] LOOP
  EXECUTE format('CREATE POLICY project_support_staff_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(private.punchlist_staff_identity(organization_id)) WITH CHECK(private.punchlist_staff_identity(organization_id))',t);
 END LOOP;
END $$;
CREATE POLICY project_punchlist_staff_read ON public.project_tasks FOR SELECT TO authenticated USING(private.punchlist_staff_access(organization_id));
CREATE POLICY project_punchlist_staff_write ON public.project_tasks FOR ALL TO authenticated USING(private.punchlist_staff_access(organization_id)) WITH CHECK(private.punchlist_staff_access(organization_id));

CREATE OR REPLACE FUNCTION private.validate_project_punchlist_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.projects;
BEGIN
 SELECT * INTO p FROM public.projects WHERE id=NEW.project_id;
 IF p.id IS NULL OR p.organization_id IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Project and punchlist organization must match' USING ERRCODE='42501'; END IF;
 IF NEW.created_by_contact_id IS NOT NULL AND NEW.created_by_contact_id IS DISTINCT FROM p.contact_id THEN RAISE EXCEPTION 'Item customer must match the project' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' AND NEW.created_by IS NULL AND private.punchlist_staff_identity(NEW.organization_id) THEN NEW.created_by=auth.uid(); END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.validate_project_punchlist_row() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_project_punchlist_row BEFORE INSERT OR UPDATE ON public.project_tasks FOR EACH ROW EXECUTE FUNCTION private.validate_project_punchlist_row();

CREATE TABLE public.project_punchlist_requests(
 request_id uuid NOT NULL REFERENCES public.service_requests(id),
 task_id uuid NOT NULL REFERENCES public.project_tasks(id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 PRIMARY KEY(request_id,task_id)
);
CREATE INDEX ON public.project_punchlist_requests(task_id);
ALTER TABLE public.project_punchlist_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_punchlist_requests FROM anon,authenticated;
GRANT SELECT ON public.project_punchlist_requests TO authenticated;
CREATE POLICY project_punchlist_requests_staff ON public.project_punchlist_requests FOR SELECT TO authenticated USING(private.punchlist_staff_identity(organization_id));

CREATE TABLE public.portal_support_photos(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id),
 contact_id uuid NOT NULL REFERENCES public.contacts(id), task_id uuid REFERENCES public.project_tasks(id),
 request_id uuid REFERENCES public.service_requests(id), storage_path text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(num_nonnulls(task_id,request_id)=1)
);
CREATE INDEX portal_support_photos_task ON public.portal_support_photos(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX portal_support_photos_request ON public.portal_support_photos(request_id) WHERE request_id IS NOT NULL;
ALTER TABLE public.portal_support_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_support_photos FROM anon,authenticated;
GRANT SELECT ON public.portal_support_photos TO authenticated;
CREATE POLICY support_photos_read ON public.portal_support_photos FOR SELECT TO authenticated
 USING(private.punchlist_staff_identity(organization_id) OR
  (private.punchlist_portal_identity(contact_id,organization_id) AND (request_id IS NOT NULL OR EXISTS(
    SELECT 1 FROM public.project_tasks t JOIN public.projects p ON p.id=t.project_id
    WHERE t.id=task_id AND t.visibility='customer_visible' AND p.contact_id=portal_support_photos.contact_id AND p.substantial_completion_date<=CURRENT_DATE))));
-- RLS on project_tasks intentionally denies portals, so storage authorization uses a
-- narrowly scoped definer helper rather than relying on a hidden parent row.
CREATE OR REPLACE FUNCTION private.support_photo_read(p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.portal_support_photos f WHERE f.storage_path=p_path AND (
 private.punchlist_staff_identity(f.organization_id) OR (private.punchlist_portal_identity(f.contact_id,f.organization_id)
 AND (EXISTS(SELECT 1 FROM public.service_requests s WHERE s.id=f.request_id AND s.contact_id=f.contact_id AND s.organization_id=f.organization_id)
 OR EXISTS(SELECT 1 FROM public.project_tasks t JOIN public.projects p ON p.id=t.project_id WHERE t.id=f.task_id AND t.visibility='customer_visible'
 AND p.contact_id=f.contact_id AND p.organization_id=f.organization_id AND p.substantial_completion_date<=CURRENT_DATE)))));
$$;
REVOKE ALL ON FUNCTION private.support_photo_read(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.support_photo_read(text) TO authenticated;
DROP POLICY support_photos_read ON public.portal_support_photos;
CREATE POLICY support_photos_read ON public.portal_support_photos FOR SELECT TO authenticated USING(private.support_photo_read(storage_path));
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('portal-support','portal-support',false,10485760,ARRAY['image/jpeg','image/png','image/webp']) ON CONFLICT(id) DO NOTHING;
CREATE POLICY portal_support_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='portal-support' AND private.support_photo_read(name));
CREATE POLICY portal_support_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='portal-support'
 AND (storage.foldername(name))[1] IS NOT NULL AND EXISTS(SELECT 1 FROM public.contacts c
 WHERE c.organization_id::text=(storage.foldername(name))[1] AND c.id::text=(storage.foldername(name))[2]
 AND private.punchlist_portal_identity(c.id,c.organization_id)
 AND (private.vip_service_entitled(c.id,c.organization_id) OR EXISTS(SELECT 1 FROM public.projects p
 WHERE p.contact_id=c.id AND p.organization_id=c.organization_id AND private.project_punchlist_open(p.id)))));

-- Legacy items are never guessed onto the latest job. Only explicit or unambiguous
-- Test & Tune project links migrate automatically; staff can place the others.
CREATE OR REPLACE FUNCTION private.place_legacy_punchlist(p_task uuid,p_project uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.punchlist_tasks; p public.projects; result uuid;
BEGIN
 SELECT * INTO t FROM public.punchlist_tasks WHERE id=p_task FOR UPDATE;
 SELECT * INTO p FROM public.projects WHERE id=p_project;
 IF t.id IS NULL OR p.id IS NULL OR t.contact_id<>p.contact_id OR t.organization_id<>p.organization_id THEN RAISE EXCEPTION 'Project must belong to the same customer'; END IF;
 SELECT id INTO result FROM public.project_tasks WHERE legacy_punchlist_id=t.id;
 IF result IS NOT NULL THEN RETURN result; END IF;
 INSERT INTO public.project_tasks(project_id,organization_id,title,description,customer_description,source,visibility,created_by_contact_id,status,progress_status,completed_at,sort_order,legacy_punchlist_id)
 VALUES(p.id,p.organization_id,coalesce(nullif(btrim(t.details),''),t.title),NULL,coalesce(nullif(btrim(t.details),''),t.title),'customer','customer_visible',t.contact_id,
 CASE WHEN t.status='completed' THEN 'completed' ELSE 'open' END,CASE WHEN t.status='completed' THEN 'completed' ELSE 'pending' END,t.completed_at,t.priority_order,t.id) RETURNING id INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION private.place_legacy_punchlist(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.assign_legacy_punchlist_project(p_task_id uuid,p_project_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;
BEGIN
 SELECT organization_id INTO org FROM public.punchlist_tasks WHERE id=p_task_id;
 IF NOT coalesce(private.punchlist_staff_access(org),false) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 RETURN private.place_legacy_punchlist(p_task_id,p_project_id);
END; $$;
DO $$ DECLARE item record; BEGIN
 FOR item IN SELECT t.id,coalesce(g.project_id,only_project.id) project_id FROM public.punchlist_tasks t
 LEFT JOIN public.punchlist_access_grants g ON g.id=t.access_grant_id AND g.contact_id=t.contact_id AND g.organization_id=t.organization_id
 LEFT JOIN LATERAL(SELECT (array_agg(DISTINCT g2.project_id))[1] id FROM public.punchlist_access_grants g2
 WHERE g2.contact_id=t.contact_id AND g2.organization_id=t.organization_id AND g2.access_type='test_and_tune' AND g2.project_id IS NOT NULL HAVING count(DISTINCT g2.project_id)=1) only_project ON true
 WHERE coalesce(g.project_id,only_project.id) IS NOT NULL LOOP
  IF EXISTS(SELECT 1 FROM public.projects p WHERE p.id=item.project_id AND p.contact_id=(SELECT contact_id FROM public.punchlist_tasks WHERE id=item.id) AND p.organization_id=(SELECT organization_id FROM public.punchlist_tasks WHERE id=item.id)) THEN
   PERFORM private.place_legacy_punchlist(item.id,item.project_id);
  END IF;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION private.sync_legacy_punchlist_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF pg_trigger_depth()>1 THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='punchlist_tasks' THEN
  UPDATE public.project_tasks SET status=CASE WHEN NEW.status='completed' THEN 'completed' ELSE 'open' END,
   progress_status=CASE WHEN NEW.status='completed' THEN 'completed' ELSE 'pending' END,completed_at=NEW.completed_at
  WHERE legacy_punchlist_id=NEW.id;
 ELSE
  IF NEW.legacy_punchlist_id IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status THEN
   UPDATE public.punchlist_tasks SET status=CASE WHEN NEW.status='completed' THEN 'completed' ELSE 'draft' END,
   completed_at=NEW.completed_at WHERE id=NEW.legacy_punchlist_id;
  END IF;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.sync_legacy_punchlist_progress() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sync_legacy_punchlist_progress AFTER UPDATE OF status ON public.punchlist_tasks FOR EACH ROW EXECUTE FUNCTION private.sync_legacy_punchlist_progress();
CREATE TRIGGER sync_project_punchlist_progress AFTER UPDATE OF status ON public.project_tasks FOR EACH ROW EXECUTE FUNCTION private.sync_legacy_punchlist_progress();

-- A customer cannot recover a hidden migrated item through the old REST route.
CREATE OR REPLACE FUNCTION private.legacy_punchlist_read(p_task uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.punchlist_tasks l WHERE l.id=p_task AND
 (private.punchlist_staff_identity(l.organization_id) OR (private.punchlist_portal_identity(l.contact_id,l.organization_id)
 AND NOT EXISTS(SELECT 1 FROM public.project_tasks t JOIN public.projects p ON p.id=t.project_id
 WHERE t.legacy_punchlist_id=l.id AND (t.visibility<>'customer_visible' OR p.substantial_completion_date IS NULL OR p.substantial_completion_date>CURRENT_DATE)))));
$$;
REVOKE ALL ON FUNCTION private.legacy_punchlist_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.legacy_punchlist_read(uuid) TO authenticated;
CREATE POLICY legacy_punchlist_visibility ON public.punchlist_tasks AS RESTRICTIVE FOR SELECT TO authenticated USING(private.legacy_punchlist_read(id));
CREATE POLICY legacy_photo_visibility ON public.punchlist_task_photos AS RESTRICTIVE FOR SELECT TO authenticated USING(private.legacy_punchlist_read(task_id));

-- Freeze old portal mutation routes. Staff can finish existing visits and place
-- unmatched records; new project work is entered only in the project punchlist.
CREATE OR REPLACE FUNCTION private.punchlist_customer_access(p_contact_id uuid,p_org_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.punchlist_staff_access(p_org_id) THEN RAISE EXCEPTION 'Use Project Punchlist or VIP Service Requests' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.contacts WHERE id=p_contact_id AND organization_id=p_org_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 RETURN false;
END; $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['punchlist_tasks','punchlist_task_photos'] LOOP
  EXECUTE format('CREATE POLICY project_support_no_legacy_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(private.punchlist_staff_identity(organization_id))',t);
  EXECUTE format('CREATE POLICY project_support_no_legacy_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING(private.punchlist_staff_identity(organization_id)) WITH CHECK(private.punchlist_staff_identity(organization_id))',t);
  EXECUTE format('CREATE POLICY project_support_no_legacy_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING(private.punchlist_staff_identity(organization_id))',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_customer_support(p_contact_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; result jsonb;
BEGIN
 SELECT organization_id INTO org FROM public.contacts WHERE id=p_contact_id;
 IF org IS NULL OR NOT (private.punchlist_portal_identity(p_contact_id,org) OR private.punchlist_staff_identity(org)) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('organization_id',org,'vip_service_access',private.vip_service_entitled(p_contact_id,org),
 'projects',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'number',p.project_number,'end_date',p.substantial_completion_date+90,'days_remaining',greatest(0,p.substantial_completion_date+90-CURRENT_DATE),'can_submit',private.project_punchlist_open(p.id),
 'tasks',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'description',t.customer_description,'status',t.status,'progress',t.progress_status,'source',t.source,
 'requested',EXISTS(SELECT 1 FROM public.project_punchlist_requests r JOIN public.service_requests s ON s.id=r.request_id WHERE r.task_id=t.id AND s.status NOT IN ('closed','cancelled')) OR EXISTS(SELECT 1 FROM public.punchlist_tasks l WHERE l.id=t.legacy_punchlist_id AND l.service_request_id IS NOT NULL AND l.status<>'completed'),
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

CREATE OR REPLACE FUNCTION private.attach_support_photos(p_org uuid,p_contact uuid,p_task uuid,p_request uuid,p_paths text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE path text;
BEGIN
 IF coalesce(cardinality(p_paths),0)>10 THEN RAISE EXCEPTION 'Use up to 10 photos'; END IF;
 FOREACH path IN ARRAY coalesce(p_paths,ARRAY[]::text[]) LOOP
  IF path NOT LIKE p_org::text||'/'||p_contact::text||'/%' OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='portal-support' AND name=path) THEN RAISE EXCEPTION 'Invalid photo'; END IF;
  INSERT INTO public.portal_support_photos(organization_id,contact_id,task_id,request_id,storage_path) VALUES(p_org,p_contact,p_task,p_request,path);
 END LOOP;
END; $$;
REVOKE ALL ON FUNCTION private.attach_support_photos(uuid,uuid,uuid,uuid,text[]) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.submit_project_punchlist_item(p_project_id uuid,p_description text,p_submission_id uuid,p_photos text[] DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.projects; result uuid;
BEGIN
 SELECT * INTO p FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF p.id IS NULL OR NOT private.punchlist_portal_identity(p.contact_id,p.organization_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 -- A retry can return the committed item even if entitlement expires between calls.
 SELECT id INTO result FROM public.project_tasks WHERE id=p_submission_id AND project_id=p.id AND created_by_contact_id=p.contact_id AND source='customer';
 IF result IS NOT NULL THEN RETURN result; END IF;
 IF NOT private.project_punchlist_open(p.id) THEN RAISE EXCEPTION 'Project Punchlist is now view-only' USING ERRCODE='42501'; END IF;
 IF nullif(btrim(p_description),'') IS NULL OR length(p_description)>10000 OR p_submission_id IS NULL THEN RAISE EXCEPTION 'Describe what needs attention (up to 10,000 characters)'; END IF;
 INSERT INTO public.project_tasks(id,project_id,organization_id,title,customer_description,source,visibility,created_by_contact_id,status)
 VALUES(p_submission_id,p.id,p.organization_id,btrim(p_description),btrim(p_description),'customer','customer_visible',p.contact_id,'open') RETURNING id INTO result;
 PERFORM private.attach_support_photos(p.organization_id,p.contact_id,result,NULL,p_photos);
 RETURN result;
END; $$;

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
 IF (SELECT count(*) FROM public.project_tasks t WHERE t.id=ANY(ids) AND t.project_id=p.id AND t.organization_id=p.organization_id AND t.status='open'
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

-- The request queue schedules visits as usual. Keep links to the canonical tasks
-- on every sibling work order so technicians report against the original item.
CREATE OR REPLACE FUNCTION private.attach_project_punchlist_visit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w public.work_orders;
BEGIN
 IF NEW.work_order_id IS NULL OR NEW.work_order_id IS NOT DISTINCT FROM OLD.work_order_id THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.project_punchlist_requests WHERE request_id=NEW.id) THEN RETURN NEW; END IF;
 FOR w IN SELECT child.* FROM public.work_orders primary_order JOIN public.work_orders child
 ON child.id=primary_order.id OR (primary_order.creation_request_id IS NOT NULL AND child.creation_request_id=primary_order.creation_request_id)
 WHERE primary_order.id=NEW.work_order_id LOOP
  IF w.project_id IS DISTINCT FROM NEW.project_id OR w.contact_id IS DISTINCT FROM NEW.contact_id OR w.organization_id IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Punchlist visit must match its project and customer'; END IF;
  INSERT INTO public.work_order_tasks(work_order_id,organization_id,assigned_to,project_task_id,title,description,estimated_hours,status,sort_order)
  SELECT w.id,w.organization_id,w.assigned_to,t.id,t.title,t.description,coalesce(t.estimated_hours,0),'pending',t.sort_order FROM public.project_punchlist_requests r JOIN public.project_tasks t ON t.id=r.task_id
  WHERE r.request_id=NEW.id AND t.status='open' AND NOT EXISTS(SELECT 1 FROM public.work_order_tasks existing WHERE existing.work_order_id=w.id AND existing.project_task_id=t.id);
 END LOOP;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.attach_project_punchlist_visit() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER attach_project_punchlist_visit AFTER UPDATE OF work_order_id ON public.service_requests FOR EACH ROW EXECUTE FUNCTION private.attach_project_punchlist_visit();

CREATE OR REPLACE FUNCTION public.submit_vip_service_request(p_contact_id uuid,p_description text,p_address text,p_submission_id uuid,p_photos text[] DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.contacts; result uuid;
BEGIN
 SELECT * INTO c FROM public.contacts WHERE id=p_contact_id FOR UPDATE;
 IF c.id IS NULL OR NOT private.punchlist_portal_identity(c.id,c.organization_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT id INTO result FROM public.service_requests WHERE organization_id=c.organization_id AND contact_id=c.id AND portal_submission_id=p_submission_id;
 IF result IS NOT NULL THEN RETURN result; END IF;
 IF NOT private.vip_service_entitled(c.id,c.organization_id) THEN RAISE EXCEPTION 'An active paid or complimentary VIP plan is required' USING ERRCODE='42501'; END IF;
 IF nullif(btrim(p_description),'') IS NULL OR length(p_description)>20000 OR nullif(btrim(p_address),'') IS NULL OR length(p_address)>1000 OR p_submission_id IS NULL THEN RAISE EXCEPTION 'Enter your service issues and service address'; END IF;
 INSERT INTO public.service_requests(organization_id,contact_id,customer_name,customer_phone,customer_email,job_location_address,job_description,billable_type,billable_by,priority,status,source_type,request_type,portal_submission_id)
 VALUES(c.organization_id,c.id,coalesce(c.full_name,c.company_name,'Customer'),c.phone,c.email,btrim(p_address),btrim(p_description),'billable','admin','normal','open','customer_portal','service',p_submission_id) RETURNING id INTO result;
 PERFORM private.attach_support_photos(c.organization_id,c.id,NULL,result,p_photos);
 RETURN result;
END; $$;

-- Release finished visits without closing unfinished canonical project work.
CREATE OR REPLACE FUNCTION private.finish_support_visit_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.service_requests; primary_order public.work_orders;
BEGIN
 IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status NOT IN ('completed','cancelled','in_progress') THEN RETURN NEW; END IF;
 FOR s IN SELECT r.* FROM public.service_requests r JOIN public.work_orders w ON w.id=r.work_order_id
 WHERE r.organization_id=NEW.organization_id AND r.contact_id=NEW.contact_id
 AND (w.id=NEW.id OR (w.creation_request_id IS NOT NULL AND w.creation_request_id=NEW.creation_request_id))
 AND (r.source_type='customer_portal' OR EXISTS(SELECT 1 FROM public.project_punchlist_requests pr WHERE pr.request_id=r.id)) LOOP
  SELECT * INTO primary_order FROM public.work_orders WHERE id=s.work_order_id;
  IF NOT EXISTS(SELECT 1 FROM public.work_orders w WHERE (w.id=primary_order.id OR (primary_order.creation_request_id IS NOT NULL AND w.creation_request_id=primary_order.creation_request_id))
    AND w.organization_id=s.organization_id AND w.contact_id=s.contact_id AND w.status NOT IN ('completed','cancelled')) THEN
   UPDATE public.service_requests SET status=CASE WHEN NEW.status='cancelled' AND NOT EXISTS(SELECT 1 FROM public.work_orders w
    WHERE (w.id=primary_order.id OR (primary_order.creation_request_id IS NOT NULL AND w.creation_request_id=primary_order.creation_request_id)) AND w.status='completed') THEN 'cancelled' ELSE 'closed' END WHERE id=s.id;
  ELSIF NEW.status='in_progress' THEN UPDATE public.service_requests SET status='in_progress' WHERE id=s.id; END IF;
 END LOOP;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.finish_support_visit_request() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER finish_support_visit_request AFTER UPDATE OF status ON public.work_orders FOR EACH ROW EXECUTE FUNCTION private.finish_support_visit_request();

-- Prevent portal profiles from changing completion dates or plan definitions to
-- manufacture their own entitlement through existing same-org policies.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['projects','recurring_plans'] LOOP
  EXECUTE format('CREATE POLICY support_staff_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(private.punchlist_staff_identity(organization_id))',t);
  EXECUTE format('CREATE POLICY support_staff_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING(private.punchlist_staff_identity(organization_id)) WITH CHECK(private.punchlist_staff_identity(organization_id))',t);
  EXECUTE format('CREATE POLICY support_staff_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING(private.punchlist_staff_identity(organization_id))',t);
 END LOOP;
END $$;
CREATE POLICY support_membership_read ON public.recurring_subscriptions AS RESTRICTIVE FOR SELECT TO authenticated USING(private.punchlist_staff_identity(organization_id) OR private.punchlist_portal_identity(contact_id,organization_id));
CREATE POLICY support_membership_delete ON public.recurring_subscriptions AS RESTRICTIVE FOR DELETE TO authenticated USING(private.punchlist_staff_identity(organization_id));
CREATE OR REPLACE FUNCTION private.guard_support_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF current_user='anon' OR (current_user='authenticated' AND NOT private.punchlist_staff_identity(NEW.organization_id)) THEN
  IF current_user='authenticated' AND (NOT private.punchlist_portal_identity(NEW.contact_id,NEW.organization_id) OR (TG_OP='UPDATE' AND NOT private.punchlist_portal_identity(OLD.contact_id,OLD.organization_id))) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF TG_OP='INSERT' THEN
   IF NEW.status<>'pending_payment' OR NEW.is_complimentary OR NEW.comped_by IS NOT NULL OR NEW.comped_at IS NOT NULL OR NEW.custom_amount IS NOT NULL
    OR NOT EXISTS(SELECT 1 FROM public.recurring_plans p WHERE p.id=NEW.plan_id AND p.organization_id=NEW.organization_id) THEN
    RAISE EXCEPTION 'Membership activation requires confirmed payment or a staff grant' USING ERRCODE='42501';
   END IF;
  ELSIF (to_jsonb(NEW)-ARRAY['notes','status','cancellation_requested','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['notes','status','cancellation_requested','updated_at'])
    OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status<>'cancelled') THEN
   RAISE EXCEPTION 'Membership changes require staff or the payment processor' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.guard_support_membership() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_support_membership BEFORE INSERT OR UPDATE ON public.recurring_subscriptions FOR EACH ROW EXECUTE FUNCTION private.guard_support_membership();
CREATE OR REPLACE FUNCTION public.request_vip_membership(p_contact_id uuid,p_plan_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.contacts; plan public.recurring_plans; result uuid;
BEGIN
 SELECT * INTO c FROM public.contacts WHERE id=p_contact_id FOR UPDATE;
 IF c.id IS NULL OR NOT private.punchlist_portal_identity(c.id,c.organization_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO plan FROM public.recurring_plans WHERE id=p_plan_id AND organization_id=c.organization_id AND plan_type='vip_plan' AND is_active;
 IF plan.id IS NULL THEN RAISE EXCEPTION 'Choose an active VIP plan'; END IF;
 SELECT id INTO result FROM public.recurring_subscriptions WHERE contact_id=c.id AND organization_id=c.organization_id AND plan_id=plan.id AND status='pending_payment' LIMIT 1;
 IF result IS NOT NULL THEN RETURN result; END IF;
 IF private.vip_service_entitled(c.id,c.organization_id) THEN RAISE EXCEPTION 'You already have an active VIP plan. Contact our team to change it.'; END IF;
 INSERT INTO public.recurring_subscriptions(company_id,organization_id,contact_id,plan_id,status,start_date,next_billing_date,auto_invoice,auto_send,auto_renew,notes)
 VALUES(c.organization_id,c.organization_id,c.id,plan.id,'pending_payment',CURRENT_DATE,CURRENT_DATE,false,false,false,'Customer requested VIP enrollment. Confirm payment before activation.') RETURNING id INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.request_vip_membership(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_vip_membership(uuid,uuid) TO authenticated;

-- Complimentary plans are real active subscriptions, explicitly zero-cost and
-- never invoiced. They no longer need an invalid 'vip_membership' punchlist grant.
CREATE OR REPLACE FUNCTION public.grant_comped_vip_membership(p_contact_id uuid,p_plan_id uuid,p_end_date date,p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; result uuid;
BEGIN
 SELECT organization_id INTO org FROM public.profiles WHERE id=auth.uid() AND is_active AND contact_id IS NULL AND role IN ('admin','manager','service_manager');
 IF org IS NULL OR NOT private.punchlist_staff_identity(org) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_end_date IS NULL OR p_end_date<CURRENT_DATE THEN RAISE EXCEPTION 'Choose an end date today or later'; END IF;
 PERFORM 1 FROM public.contacts WHERE id=p_contact_id AND organization_id=org FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.recurring_plans WHERE id=p_plan_id AND organization_id=org AND plan_type='vip_plan' AND is_active) THEN RAISE EXCEPTION 'Invalid customer or VIP plan'; END IF;
 IF EXISTS(SELECT 1 FROM public.recurring_subscriptions s JOIN public.recurring_plans p ON p.id=s.plan_id WHERE s.contact_id=p_contact_id AND s.organization_id=org AND p.plan_type='vip_plan' AND s.status IN ('active','trial','pending_payment') AND (s.end_date IS NULL OR s.end_date>=CURRENT_DATE)) THEN RAISE EXCEPTION 'Customer already has an active VIP plan'; END IF;
 INSERT INTO public.recurring_subscriptions(company_id,organization_id,contact_id,plan_id,status,start_date,end_date,next_billing_date,custom_amount,is_complimentary,auto_invoice,auto_send,auto_renew,created_by,notes,comped_by,comped_at,comp_reason)
 VALUES(org,org,p_contact_id,p_plan_id,'active',CURRENT_DATE,p_end_date,p_end_date,0,true,false,false,false,auth.uid(),p_notes,auth.uid(),now(),p_notes) RETURNING id INTO result;
 RETURN result;
END; $$;
-- Do not infer complimentary status from a free trial or a disabled invoice flag.

REVOKE ALL ON FUNCTION public.get_customer_support(uuid),public.submit_project_punchlist_item(uuid,text,uuid,text[]),public.request_project_punchlist_visit(uuid,uuid[],uuid),public.submit_vip_service_request(uuid,text,text,uuid,text[]),public.assign_legacy_punchlist_project(uuid,uuid),public.grant_comped_vip_membership(uuid,uuid,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_customer_support(uuid),public.submit_project_punchlist_item(uuid,text,uuid,text[]),public.request_project_punchlist_visit(uuid,uuid[],uuid),public.submit_vip_service_request(uuid,text,text,uuid,text[]),public.assign_legacy_punchlist_project(uuid,uuid),public.grant_comped_vip_membership(uuid,uuid,date,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_punchlist_unseen_count(p_after timestamptz DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; result bigint;
BEGIN
 SELECT organization_id INTO org FROM public.profiles WHERE id=auth.uid();
 IF org IS NULL OR NOT private.punchlist_staff_access(org) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT (SELECT count(*) FROM public.project_tasks WHERE organization_id=org AND source='customer' AND status='open' AND (p_after IS NULL OR created_at>p_after))
  +(SELECT count(*) FROM public.punchlist_tasks l WHERE l.organization_id=org AND l.status IN ('draft','requested','scheduled','in_work_order') AND (p_after IS NULL OR l.created_at>p_after)
   AND NOT EXISTS(SELECT 1 FROM public.project_tasks t WHERE t.legacy_punchlist_id=l.id)) INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.get_punchlist_unseen_count(timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_punchlist_unseen_count(timestamptz) TO authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AND NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='project_tasks') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.project_tasks;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_punchlist_access_info(p_contact_id uuid)
RETURNS TABLE(has_access boolean,access_type text,days_remaining integer,expiration_date date,subscription_plan_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;
BEGIN
 SELECT organization_id INTO org FROM public.contacts WHERE id=p_contact_id;
 IF org IS NULL OR NOT (private.punchlist_portal_identity(p_contact_id,org) OR private.punchlist_staff_identity(org)) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT true,'test_and_tune'::text,p.substantial_completion_date+90-CURRENT_DATE,p.substantial_completion_date+90,NULL::text
 FROM public.projects p WHERE p.contact_id=p_contact_id AND p.organization_id=org AND private.project_punchlist_open(p.id) ORDER BY p.substantial_completion_date DESC LIMIT 1;
 IF NOT FOUND THEN RETURN QUERY SELECT false,NULL::text,NULL::integer,NULL::date,NULL::text; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.get_punchlist_access_info(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_punchlist_access_info(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
