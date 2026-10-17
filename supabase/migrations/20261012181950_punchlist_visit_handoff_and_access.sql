-- Preserve customer Punchlist identity: visit links are not project/internal tasks.
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE public.work_order_punchlist_items (
 work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
 punchlist_task_id uuid NOT NULL REFERENCES public.punchlist_tasks(id) ON DELETE RESTRICT,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 visit_result text CHECK (visit_result IN ('completed','unfinished')),
 completion_notes text,
 remaining_work text,
 reported_by uuid REFERENCES public.profiles(id),
 reported_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(work_order_id,punchlist_task_id)
);
CREATE INDEX work_order_punchlist_task_idx ON public.work_order_punchlist_items(punchlist_task_id);
CREATE TABLE public.punchlist_staff_notes (
 task_id uuid PRIMARY KEY REFERENCES public.punchlist_tasks(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 notes text, updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.work_order_punchlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punchlist_staff_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_order_punchlist_items,public.punchlist_staff_notes FROM anon;
GRANT SELECT ON public.work_order_punchlist_items TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.punchlist_staff_notes TO authenticated;

CREATE OR REPLACE FUNCTION private.punchlist_staff_access(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND NOT coalesce((auth.jwt()->'app_metadata'->>'is_portal_user')::boolean,false)
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active AND p.organization_id=p_org
 AND p.contact_id IS NULL AND p.role NOT IN ('portal_user','customer','portal','client') AND public.flow_has_module_access('punchlist_admin'));
$$;
CREATE OR REPLACE FUNCTION private.punchlist_grant_manager(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.punchlist_staff_access(p_org) AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('admin','manager','office_manager','sales_manager','project_manager','service_manager'));
$$;
REVOKE ALL ON FUNCTION private.punchlist_grant_manager(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.punchlist_grant_manager(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION private.punchlist_visit_access(p_order uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND NOT coalesce((auth.jwt()->'app_metadata'->>'is_portal_user')::boolean,false)
 AND EXISTS(SELECT 1 FROM public.work_orders w JOIN public.profiles p ON p.organization_id=w.organization_id
 WHERE w.id=p_order AND p.id=auth.uid() AND p.is_active AND p.contact_id IS NULL
 AND p.role NOT IN ('portal_user','customer','portal','client')
 AND (w.assigned_to=p.id OR p.role IN ('admin','manager','office_manager','service_manager','project_manager','dispatcher')
 OR EXISTS(SELECT 1 FROM public.work_order_assignments a WHERE a.work_order_id=w.id AND a.user_id=p.id)));
$$;
REVOKE ALL ON FUNCTION private.punchlist_staff_access(uuid),private.punchlist_visit_access(uuid) FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.punchlist_staff_access(uuid),private.punchlist_visit_access(uuid) TO authenticated;
CREATE POLICY visit_punchlist_read ON public.work_order_punchlist_items FOR SELECT TO authenticated
 USING(private.punchlist_visit_access(work_order_id));
CREATE POLICY staff_punchlist_notes ON public.punchlist_staff_notes FOR ALL TO authenticated
 USING(private.punchlist_staff_access(organization_id))
 WITH CHECK(private.punchlist_staff_access(organization_id) AND EXISTS(SELECT 1 FROM public.punchlist_tasks t WHERE t.id=punchlist_staff_notes.task_id AND t.organization_id=punchlist_staff_notes.organization_id));

-- Preserve all existing technician notes behind staff-only RLS. Customer records carry status, not technician notes.
INSERT INTO public.punchlist_staff_notes(task_id,organization_id,notes)
 SELECT id,organization_id,installer_notes FROM public.punchlist_tasks
 WHERE nullif(btrim(installer_notes),'') IS NOT NULL;
UPDATE public.punchlist_tasks SET installer_notes=NULL WHERE installer_notes IS NOT NULL;

CREATE OR REPLACE FUNCTION private.link_punchlist_visit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE primary_order public.work_orders;
BEGIN
 IF NEW.work_order_id IS NULL OR (TG_OP='UPDATE' AND NEW.work_order_id IS NOT DISTINCT FROM OLD.work_order_id) THEN RETURN NEW; END IF;
 SELECT * INTO primary_order FROM public.work_orders WHERE id=NEW.work_order_id;
 IF primary_order.organization_id IS DISTINCT FROM NEW.organization_id OR primary_order.contact_id IS DISTINCT FROM NEW.contact_id THEN RAISE EXCEPTION 'Punchlist visit customer/organization mismatch'; END IF;
 INSERT INTO public.work_order_punchlist_items(work_order_id,punchlist_task_id,organization_id)
 SELECT w.id,t.id,NEW.organization_id FROM public.work_orders w CROSS JOIN public.punchlist_tasks t
 WHERE t.service_request_id=NEW.id AND t.organization_id=NEW.organization_id AND t.contact_id=NEW.contact_id AND t.status<>'completed'
 AND w.organization_id=NEW.organization_id AND w.contact_id=NEW.contact_id
 AND (w.id=NEW.work_order_id OR (primary_order.creation_request_id IS NOT NULL AND w.creation_request_id=primary_order.creation_request_id))
 ON CONFLICT DO NOTHING;
 UPDATE public.punchlist_tasks SET work_order_id=NEW.work_order_id,status='scheduled',updated_at=now()
 WHERE service_request_id=NEW.id AND organization_id=NEW.organization_id AND contact_id=NEW.contact_id AND status<>'completed';
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.link_punchlist_visit() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER link_punchlist_visit AFTER INSERT OR UPDATE OF work_order_id ON public.service_requests
 FOR EACH ROW EXECUTE FUNCTION private.link_punchlist_visit();

-- Only existing, explicitly linked requests are recovered; never parse description text.
INSERT INTO public.work_order_punchlist_items(work_order_id,punchlist_task_id,organization_id)
 SELECT w.id,t.id,t.organization_id FROM public.punchlist_tasks t
 JOIN public.service_requests s ON s.id=t.service_request_id AND s.organization_id=t.organization_id AND s.contact_id=t.contact_id
 JOIN public.work_orders primary_order ON primary_order.id=s.work_order_id AND primary_order.organization_id=t.organization_id AND primary_order.contact_id=t.contact_id
 JOIN public.work_orders w ON w.organization_id=t.organization_id AND w.contact_id=t.contact_id
 AND (w.id=primary_order.id OR (primary_order.creation_request_id IS NOT NULL AND w.creation_request_id=primary_order.creation_request_id))
 ON CONFLICT DO NOTHING;

INSERT INTO public.work_order_punchlist_items(work_order_id,punchlist_task_id,organization_id)
 SELECT w.id,t.id,t.organization_id FROM public.punchlist_tasks t JOIN public.work_orders w
 ON w.id=t.work_order_id AND w.organization_id=t.organization_id AND w.contact_id=t.contact_id
 ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_work_order_punchlist(p_work_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.punchlist_visit_access(p_work_order_id) THEN RAISE EXCEPTION 'Visit access denied' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
 'id',t.id,'description',coalesce(nullif(btrim(t.details),''),t.title),'status',CASE WHEN visit.status IN ('completed','cancelled') AND a.visit_result='completed' THEN 'completed' ELSE t.status END,'updated_at',t.updated_at,
 'customer_notes',t.customer_notes,'completion_notes',a.completion_notes,
 'internal_notes',n.notes,'previous_visit_notes',(SELECT previous.remaining_work FROM public.work_order_punchlist_items previous JOIN public.work_orders prior_visit ON prior_visit.id=previous.work_order_id WHERE previous.punchlist_task_id=t.id AND previous.work_order_id<>a.work_order_id AND prior_visit.status IN ('completed','cancelled') AND previous.reported_at<a.created_at AND nullif(btrim(previous.remaining_work),'') IS NOT NULL ORDER BY previous.reported_at DESC LIMIT 1),'visit_result',a.visit_result,'remaining_work',a.remaining_work,
 'photos',coalesce((SELECT jsonb_agg(jsonb_build_object('id',ph.id,'photo_url',ph.photo_url)) FROM public.punchlist_task_photos ph WHERE ph.task_id=t.id),'[]'::jsonb)
 ) ORDER BY t.priority_order,t.created_at,t.id) FROM public.work_order_punchlist_items a
 JOIN public.punchlist_tasks t ON t.id=a.punchlist_task_id JOIN public.work_orders visit ON visit.id=a.work_order_id LEFT JOIN public.punchlist_staff_notes n ON n.task_id=t.id
 WHERE a.work_order_id=p_work_order_id AND t.organization_id=a.organization_id AND visit.organization_id=a.organization_id AND t.contact_id=visit.contact_id),'[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.get_work_order_punchlist(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_work_order_punchlist(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_work_order_punchlist(p_work_order_id uuid,p_task_id uuid,p_outcome text,p_notes text,p_expected_updated_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.punchlist_tasks; w public.work_orders;
BEGIN
 IF NOT private.punchlist_visit_access(p_work_order_id) THEN RAISE EXCEPTION 'Visit access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO w FROM public.work_orders WHERE id=p_work_order_id FOR UPDATE;
 IF w.status='completed' THEN RAISE EXCEPTION 'This visit is completed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.work_order_punchlist_items WHERE work_order_id=w.id AND punchlist_task_id=p_task_id AND organization_id=w.organization_id) THEN RAISE EXCEPTION 'Item is not on this visit'; END IF;
 SELECT * INTO t FROM public.punchlist_tasks WHERE id=p_task_id FOR UPDATE;
 IF t.organization_id IS DISTINCT FROM w.organization_id OR t.contact_id IS DISTINCT FROM w.contact_id THEN RAISE EXCEPTION 'Item/visit mismatch'; END IF;
 IF t.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Another person updated this item. Refresh before saving.'; END IF;
 IF p_outcome NOT IN ('completed','unfinished') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
 IF p_outcome='unfinished' AND nullif(btrim(p_notes),'') IS NULL THEN RAISE EXCEPTION 'Explain the remaining work'; END IF;
 IF p_outcome='completed' THEN
  IF t.status='completed' THEN RETURN; END IF;
  UPDATE public.punchlist_tasks SET status='completed',completed_at=now(),completed_by=auth.uid(),completed_by_customer=false,installer_notes=NULL,updated_at=now() WHERE id=t.id;
 ELSE
  IF t.status='completed' THEN RAISE EXCEPTION 'This customer item is already complete'; END IF;
 END IF;
 UPDATE public.work_order_punchlist_items SET visit_result=p_outcome,completion_notes=CASE WHEN p_outcome='completed' THEN nullif(btrim(p_notes),'') END,
 remaining_work=CASE WHEN p_outcome='unfinished' THEN btrim(p_notes) END,reported_by=auth.uid(),reported_at=now()
 WHERE punchlist_task_id=t.id AND (work_order_id=w.id OR (p_outcome='completed' AND EXISTS(SELECT 1 FROM public.work_orders other_visit WHERE other_visit.id=work_order_punchlist_items.work_order_id AND other_visit.organization_id=w.organization_id AND other_visit.status NOT IN ('completed','cancelled'))));
END; $$;
REVOKE ALL ON FUNCTION public.report_work_order_punchlist(uuid,uuid,text,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.report_work_order_punchlist(uuid,uuid,text,text,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION private.require_punchlist_visit_outcomes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status IN ('completed','cancelled') AND NEW.status IS DISTINCT FROM OLD.status THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('punchlist-visit:'||coalesce(NEW.creation_request_id::text,NEW.id::text),0));
 END IF;
 IF NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
  IF EXISTS(SELECT 1 FROM public.work_order_punchlist_items a JOIN public.punchlist_tasks t ON t.id=a.punchlist_task_id
   WHERE a.work_order_id=NEW.id AND t.status<>'completed' AND (a.visit_result IS DISTINCT FROM 'unfinished' OR nullif(btrim(a.remaining_work),'') IS NULL))
  THEN RAISE EXCEPTION 'Complete each Customer Punchlist item or explain its remaining work before closing this visit'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER require_punchlist_visit_outcomes BEFORE UPDATE OF status ON public.work_orders
 FOR EACH ROW EXECUTE FUNCTION private.require_punchlist_visit_outcomes();
REVOKE ALL ON FUNCTION private.require_punchlist_visit_outcomes() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.release_unfinished_punchlist_items()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status IN ('completed','cancelled') AND NEW.status IS DISTINCT FROM OLD.status THEN
  UPDATE public.punchlist_tasks t SET status='draft',work_order_id=NULL,service_request_id=NULL,requested_at=NULL,updated_at=now()
  WHERE t.status<>'completed' AND EXISTS(SELECT 1 FROM public.work_order_punchlist_items a WHERE a.work_order_id=NEW.id AND a.punchlist_task_id=t.id)
  AND NOT EXISTS(SELECT 1 FROM public.work_order_punchlist_items a JOIN public.work_orders w ON w.id=a.work_order_id
   WHERE a.punchlist_task_id=t.id AND w.status NOT IN ('completed','cancelled'));
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER release_unfinished_punchlist_items AFTER UPDATE OF status ON public.work_orders
 FOR EACH ROW EXECUTE FUNCTION private.release_unfinished_punchlist_items();
REVOKE ALL ON FUNCTION private.release_unfinished_punchlist_items() FROM PUBLIC,anon,authenticated;

-- A portal identity is resolved from trusted claims even without a staff profile.
CREATE OR REPLACE FUNCTION private.punchlist_portal_identity(p_contact uuid,p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND (
 (coalesce((auth.jwt()->'app_metadata'->>'is_portal_user')::boolean,false)
 AND auth.jwt()->'app_metadata'->>'contact_id'=p_contact::text AND auth.jwt()->'app_metadata'->>'organization_id'=p_org::text)
 OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active AND p.role IN ('portal_user','customer','portal','client') AND p.contact_id=p_contact AND p.organization_id=p_org));
$$;
CREATE OR REPLACE FUNCTION private.punchlist_entitled(p_contact uuid,p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.recurring_subscriptions s JOIN public.recurring_plans rp ON rp.id=s.plan_id
 WHERE s.contact_id=p_contact AND s.organization_id=p_org AND s.status='active' AND rp.plan_type='vip_plan'
 AND (s.end_date IS NULL OR s.end_date>=CURRENT_DATE) AND s.next_billing_date>=CURRENT_DATE)
 OR EXISTS(SELECT 1 FROM public.punchlist_access_grants g LEFT JOIN public.recurring_subscriptions s ON s.id=g.subscription_id
 WHERE g.contact_id=p_contact AND g.organization_id=p_org AND g.status='active'
 AND (g.expiration_date IS NULL OR g.expiration_date>=CURRENT_DATE)
 AND (g.access_type<>'vip_trial' OR (s.status IN ('trial','active') AND s.trial_source='vip_trial' AND s.trial_end_date>=CURRENT_DATE)));
$$;
CREATE OR REPLACE FUNCTION private.punchlist_portal_access(p_contact uuid,p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.punchlist_portal_identity(p_contact,p_org) AND private.punchlist_entitled(p_contact,p_org);
$$;
REVOKE ALL ON FUNCTION private.punchlist_portal_identity(uuid,uuid),private.punchlist_entitled(uuid,uuid),private.punchlist_portal_access(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.punchlist_portal_identity(uuid,uuid),private.punchlist_portal_access(uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION private.punchlist_customer_access(p_contact_id uuid,p_org_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF private.punchlist_portal_identity(p_contact_id,p_org_id) THEN
  IF NOT private.punchlist_entitled(p_contact_id,p_org_id) THEN RAISE EXCEPTION 'Active VIP or Test & Tune access is required' USING ERRCODE='42501'; END IF;
  RETURN true;
 END IF;
 IF NOT private.punchlist_staff_access(p_org_id) THEN RAISE EXCEPTION 'Punchlist item access denied' USING ERRCODE='42501'; END IF;
 RETURN false;
END; $$;
REVOKE ALL ON FUNCTION private.punchlist_customer_access(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_punchlist_access_info(p_contact_id uuid)
RETURNS TABLE(has_access boolean,access_type text,days_remaining integer,expiration_date date,subscription_plan_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid;
BEGIN
 SELECT organization_id INTO v_org FROM public.contacts WHERE id=p_contact_id;
 IF v_org IS NULL OR NOT (private.punchlist_portal_identity(p_contact_id,v_org) OR private.punchlist_staff_identity(v_org)) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT true,'vip_membership'::text,NULL::integer,s.end_date::date,rp.plan_name
 FROM public.recurring_subscriptions s JOIN public.recurring_plans rp ON rp.id=s.plan_id
 WHERE s.contact_id=p_contact_id AND s.organization_id=v_org AND s.status='active' AND rp.plan_type='vip_plan'
 AND (s.end_date IS NULL OR s.end_date>=CURRENT_DATE) AND s.next_billing_date>=CURRENT_DATE LIMIT 1;
 IF FOUND THEN RETURN; END IF;
 RETURN QUERY SELECT true,g.access_type,CASE WHEN g.expiration_date IS NULL THEN NULL ELSE g.expiration_date-CURRENT_DATE END,g.expiration_date,rp.plan_name
 FROM public.punchlist_access_grants g LEFT JOIN public.recurring_subscriptions s ON s.id=g.subscription_id LEFT JOIN public.recurring_plans rp ON rp.id=s.plan_id
 WHERE g.contact_id=p_contact_id AND g.organization_id=v_org AND g.status='active' AND (g.expiration_date IS NULL OR g.expiration_date>=CURRENT_DATE)
 AND (g.access_type<>'vip_trial' OR (s.status IN ('trial','active') AND s.trial_source='vip_trial' AND s.trial_end_date>=CURRENT_DATE))
 ORDER BY g.expiration_date DESC NULLS FIRST LIMIT 1;
 IF NOT FOUND THEN RETURN QUERY SELECT false,NULL::text,NULL::integer,NULL::date,NULL::text; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.get_punchlist_access_info(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_punchlist_access_info(uuid) TO authenticated;

-- Remove permissive dealer-wide portal policies before installing precise policies.
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename IN ('punchlist_tasks','punchlist_task_photos','punchlist_access_grants')
 LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename); END LOOP;
END $$;
CREATE POLICY staff_punchlist_items ON public.punchlist_tasks FOR ALL TO authenticated
 USING(private.punchlist_staff_access(organization_id)) WITH CHECK(private.punchlist_staff_access(organization_id) AND EXISTS(SELECT 1 FROM public.contacts c WHERE c.id=punchlist_tasks.contact_id AND c.organization_id=punchlist_tasks.organization_id));
CREATE POLICY portal_punchlist_read ON public.punchlist_tasks FOR SELECT TO authenticated
 USING(private.punchlist_portal_access(contact_id,organization_id));
CREATE POLICY portal_punchlist_insert ON public.punchlist_tasks FOR INSERT TO authenticated
 WITH CHECK(private.punchlist_portal_access(contact_id,organization_id) AND status='draft' AND installer_notes IS NULL AND service_request_id IS NULL AND work_order_id IS NULL);
CREATE POLICY portal_punchlist_update ON public.punchlist_tasks FOR UPDATE TO authenticated
 USING(private.punchlist_portal_access(contact_id,organization_id)) WITH CHECK(private.punchlist_portal_access(contact_id,organization_id));
CREATE POLICY portal_punchlist_delete ON public.punchlist_tasks FOR DELETE TO authenticated
 USING(private.punchlist_portal_access(contact_id,organization_id) AND status='draft' AND work_order_id IS NULL AND service_request_id IS NULL);
CREATE POLICY staff_punchlist_photos ON public.punchlist_task_photos FOR ALL TO authenticated
 USING(private.punchlist_staff_access(organization_id)) WITH CHECK(private.punchlist_staff_access(organization_id));
CREATE POLICY portal_punchlist_photos_read ON public.punchlist_task_photos FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.punchlist_tasks t WHERE t.id=task_id AND private.punchlist_portal_access(t.contact_id,t.organization_id)));
CREATE POLICY portal_punchlist_photos_insert ON public.punchlist_task_photos FOR INSERT TO authenticated
 WITH CHECK(EXISTS(SELECT 1 FROM public.punchlist_tasks t WHERE t.id=punchlist_task_photos.task_id AND t.organization_id=punchlist_task_photos.organization_id AND private.punchlist_portal_access(t.contact_id,t.organization_id)));
CREATE POLICY portal_punchlist_photos_delete ON public.punchlist_task_photos FOR DELETE TO authenticated
 USING(EXISTS(SELECT 1 FROM public.punchlist_tasks t WHERE t.id=task_id AND private.punchlist_portal_access(t.contact_id,t.organization_id) AND t.status='draft'));
CREATE POLICY staff_punchlist_grants_read ON public.punchlist_access_grants FOR SELECT TO authenticated USING(private.punchlist_staff_access(organization_id));
CREATE POLICY staff_punchlist_grants_manage ON public.punchlist_access_grants FOR ALL TO authenticated USING(private.punchlist_grant_manager(organization_id)) WITH CHECK(private.punchlist_grant_manager(organization_id));
CREATE POLICY portal_punchlist_grants_read ON public.punchlist_access_grants FOR SELECT TO authenticated
 USING(private.punchlist_portal_identity(contact_id,organization_id));

-- Direct customer updates may edit content, never status/linkage or staff/completion notes.
-- Checked SECURITY DEFINER action functions use their own authorization and are not direct API updates.
CREATE OR REPLACE FUNCTION private.guard_punchlist_api_update()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND current_user='authenticated' AND private.punchlist_portal_identity(OLD.contact_id,OLD.organization_id)
 AND (to_jsonb(NEW)-ARRAY['title','details','customer_notes','priority_order','updated_at']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['title','details','customer_notes','priority_order','updated_at'])
 THEN RAISE EXCEPTION 'Use the authorized Punchlist action to change status or completion notes' USING ERRCODE='42501'; END IF;
 IF NEW.installer_notes IS NOT NULL THEN RAISE EXCEPTION 'Technician notes must be saved as internal notes'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER guard_punchlist_api_update BEFORE INSERT OR UPDATE ON public.punchlist_tasks FOR EACH ROW EXECUTE FUNCTION private.guard_punchlist_api_update();
REVOKE ALL ON FUNCTION private.guard_punchlist_api_update() FROM PUBLIC,anon;

CREATE OR REPLACE FUNCTION public.renew_punchlist_access(p_access_grant_id uuid,p_days integer DEFAULT 90)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.punchlist_access_grants;
BEGIN
 SELECT * INTO g FROM public.punchlist_access_grants WHERE id=p_access_grant_id FOR UPDATE;
 IF NOT FOUND OR NOT private.punchlist_grant_manager(g.organization_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF p_days IS NULL OR p_days NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'Access duration must be 1 to 365 days'; END IF;
 UPDATE public.punchlist_access_grants SET status='active',granted_date=CURRENT_DATE,expiration_date=CURRENT_DATE+p_days,updated_at=now() WHERE id=g.id;
END; $$;
CREATE OR REPLACE FUNCTION public.toggle_punchlist_access_suspension(p_access_grant_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.punchlist_access_grants; v_status text;
BEGIN
 SELECT * INTO g FROM public.punchlist_access_grants WHERE id=p_access_grant_id FOR UPDATE;
 IF NOT FOUND OR NOT private.punchlist_grant_manager(g.organization_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF g.status NOT IN ('active','suspended') THEN RAISE EXCEPTION 'Only active or suspended grants can be changed'; END IF;
 v_status=CASE WHEN g.status='active' THEN 'suspended' ELSE 'active' END;
 UPDATE public.punchlist_access_grants SET status=v_status,suspended_at=CASE WHEN v_status='suspended' THEN now() END,suspended_by=CASE WHEN v_status='suspended' THEN auth.uid() END,updated_at=now() WHERE id=g.id;
 RETURN v_status;
END; $$;
-- Preserve the staff contact-page grant contract with verified tenant ownership.
CREATE OR REPLACE FUNCTION public.grant_punchlist_access_directly(p_contact_id uuid,p_days integer DEFAULT 90,p_notes text DEFAULT NULL)
RETURNS TABLE(access_grant_id uuid,is_renewal boolean) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_id uuid; v_renewal boolean;
BEGIN
 SELECT organization_id INTO v_org FROM public.contacts WHERE id=p_contact_id;
 IF v_org IS NULL OR NOT private.punchlist_grant_manager(v_org) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF p_days IS NULL OR p_days NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'Access duration must be 1 to 365 days'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_contact_id::text,0));
 -- Explicit complimentary access never changes a project-based Test & Tune or paid membership.
 SELECT id INTO v_id FROM public.punchlist_access_grants WHERE contact_id=p_contact_id AND organization_id=v_org AND access_type='promotional' ORDER BY granted_date DESC LIMIT 1 FOR UPDATE;
 v_renewal=v_id IS NOT NULL;
 IF v_renewal THEN
  UPDATE public.punchlist_access_grants SET status='active',granted_date=CURRENT_DATE,expiration_date=CURRENT_DATE+p_days,notes=p_notes,updated_at=now() WHERE id=v_id;
 ELSE
  INSERT INTO public.punchlist_access_grants(organization_id,contact_id,access_type,status,granted_date,expiration_date,notes)
  VALUES(v_org,p_contact_id,'promotional','active',CURRENT_DATE,CURRENT_DATE+p_days,p_notes) RETURNING id INTO v_id;
 END IF;
 RETURN QUERY SELECT v_id,v_renewal;
END; $$;
REVOKE ALL ON FUNCTION public.grant_punchlist_access_directly(uuid,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.grant_punchlist_access_directly(uuid,integer,text) TO authenticated;
REVOKE ALL ON FUNCTION public.renew_punchlist_access(uuid,integer),public.toggle_punchlist_access_suspension(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.renew_punchlist_access(uuid,integer),public.toggle_punchlist_access_suspension(uuid) TO authenticated;

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.work_order_punchlist_items,public.punchlist_staff_notes;
 END IF;
END $$;
NOTIFY pgrst,'reload schema';

CREATE OR REPLACE FUNCTION public.request_punchlist_service(p_task_ids uuid[], p_contact_id uuid, p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_contact public.contacts%ROWTYPE;
  v_ids uuid[];
  v_count int;
  v_request_id uuid;
  v_existing uuid[];
  v_description text;
BEGIN
  SELECT * INTO v_contact FROM public.contacts WHERE id=p_contact_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contact not found'; END IF;
  PERFORM private.punchlist_customer_access(p_contact_id,v_contact.organization_id);
  -- Serialize requests and item mutations for this customer, including concurrent retries.
  PERFORM 1 FROM public.contacts WHERE id=p_contact_id FOR UPDATE;
  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_ids FROM unnest(p_task_ids) x WHERE x IS NOT NULL;
  IF coalesce(cardinality(v_ids),0)=0 THEN RAISE EXCEPTION 'Select at least one item'; END IF;
  SELECT count(*) INTO v_count FROM public.punchlist_tasks
  WHERE id=ANY(v_ids) AND contact_id=p_contact_id AND organization_id=v_contact.organization_id;
  IF v_count <> cardinality(v_ids) THEN RAISE EXCEPTION 'Invalid punchlist selection' USING ERRCODE='42501'; END IF;
  -- Exact retries return the existing open request, without extra requests or notifications.
  IF NOT EXISTS (SELECT 1 FROM public.punchlist_tasks WHERE id=ANY(v_ids)
                 AND (status <> 'requested' OR service_request_id IS NULL)) THEN
    SELECT array_agg(DISTINCT service_request_id) INTO v_existing FROM public.punchlist_tasks WHERE id=ANY(v_ids);
    IF cardinality(v_existing)=1 AND EXISTS (SELECT 1 FROM public.service_requests
        WHERE id=v_existing[1] AND status='open') THEN
      RETURN v_existing[1];
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.punchlist_tasks WHERE id=ANY(v_ids)
             AND (status <> 'draft' OR service_request_id IS NOT NULL OR work_order_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Some selected items have already been requested. Refresh your list.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.punchlist_tasks WHERE id=ANY(v_ids)
             AND coalesce(nullif(btrim(details),''),nullif(btrim(title),'')) IS NULL) THEN
    RAISE EXCEPTION 'Describe what needs attention before requesting service';
  END IF;
  SELECT string_agg('- ' || coalesce(nullif(btrim(details),''),title), E'\n' ORDER BY priority_order,created_at,id)
  INTO v_description FROM public.punchlist_tasks WHERE id=ANY(v_ids);
  INSERT INTO public.service_requests (
    organization_id,contact_id,customer_name,customer_phone,customer_email,
    job_location_address,job_location_city,job_location_state,job_location_zip,
    job_description,billable_type,billable_by,priority,notes,status,source_type,created_by
  ) VALUES (
    v_contact.organization_id,p_contact_id,coalesce(v_contact.full_name,v_contact.company_name,'Customer'),
    v_contact.phone,v_contact.email,coalesce(v_contact.street_address,'Address on file'),
    v_contact.city,v_contact.state,v_contact.zip_code,
    'Customer Punchlist visit (' || cardinality(v_ids) || ' items)' || coalesce(E'\n\nNotes: ' || nullif(btrim(p_notes),''),''),
    'warranty','admin','normal','Created from customer punchlist portal','open','punchlist',
    (SELECT id FROM public.profiles WHERE id=auth.uid())
  ) RETURNING id INTO v_request_id;
  UPDATE public.punchlist_tasks SET status='requested',service_request_id=v_request_id,
    requested_at=now(),updated_at=now() WHERE id=ANY(v_ids);
  RETURN v_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_punchlist_item(p_task_id uuid,p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_task public.punchlist_tasks%ROWTYPE;
  v_request public.service_requests%ROWTYPE;
  v_customer boolean;
BEGIN
  SELECT * INTO v_task FROM public.punchlist_tasks WHERE id=p_task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
  v_customer := private.punchlist_customer_access(v_task.contact_id,v_task.organization_id);
  PERFORM 1 FROM public.contacts WHERE id=v_task.contact_id FOR UPDATE;
  SELECT * INTO v_task FROM public.punchlist_tasks WHERE id=p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF v_task.service_request_id IS NOT NULL THEN
    SELECT * INTO v_request FROM public.service_requests WHERE id=v_task.service_request_id FOR UPDATE;
  END IF;
  IF p_action IN ('cancel','delete') AND (v_task.work_order_id IS NOT NULL OR v_request.work_order_id IS NOT NULL OR (p_action='delete' AND EXISTS(SELECT 1 FROM public.work_order_punchlist_items WHERE punchlist_task_id=v_task.id))) THEN
    RAISE EXCEPTION 'A work order exists. Contact your service manager to make changes.';
  END IF;
  IF p_action='cancel' THEN
    IF v_task.status <> 'requested' THEN RAISE EXCEPTION 'This item has no pending service request'; END IF;
    UPDATE public.punchlist_tasks SET status='draft',service_request_id=NULL,requested_at=NULL,updated_at=now() WHERE id=p_task_id;
  ELSIF p_action='delete' THEN
    IF v_task.status NOT IN ('draft','requested') THEN RAISE EXCEPTION 'Only unrequested or pending items can be deleted'; END IF;
    DELETE FROM public.punchlist_tasks WHERE id=p_task_id;
  ELSIF p_action='complete' THEN
    UPDATE public.punchlist_tasks SET status='completed',completed_at=now(),
      completed_by=(SELECT id FROM public.profiles WHERE id=auth.uid()),
      completed_by_customer=v_customer,updated_at=now() WHERE id=p_task_id;
  ELSIF p_action='reopen' THEN
    IF v_task.status <> 'completed' THEN RAISE EXCEPTION 'Only completed items can be reopened'; END IF;
    UPDATE public.punchlist_tasks SET status='draft',service_request_id=NULL,work_order_id=NULL,
      requested_at=NULL,completed_at=NULL,completed_by=NULL,completed_by_customer=false,installer_notes=NULL,updated_at=now() WHERE id=p_task_id;
  ELSE RAISE EXCEPTION 'Invalid item action'; END IF;
  -- A pending request is cancelled only after its final active item is removed/resolved.
  -- A scheduled work order is never implicitly cancelled by a single item action.
  IF v_request.id IS NOT NULL AND v_request.work_order_id IS NULL AND v_request.status='open'
     AND NOT EXISTS (SELECT 1 FROM public.punchlist_tasks WHERE service_request_id=v_request.id AND status <> 'completed') THEN
    UPDATE public.service_requests SET status='cancelled' WHERE id=v_request.id;
  END IF;
  -- Keep pending request instructions aligned with remaining requested items.
  IF p_action IN ('cancel','delete','complete','reopen') AND v_request.id IS NOT NULL
     AND v_request.work_order_id IS NULL AND EXISTS (SELECT 1 FROM public.service_requests WHERE id=v_request.id AND status='open') THEN
    UPDATE public.service_requests SET job_description='Customer Punchlist visit (' ||
      (SELECT count(*) FROM public.punchlist_tasks WHERE service_request_id=v_request.id AND status <> 'completed') || ' items)'
      -- Original notes are retained on the request rather than silently discarded.
      || CASE WHEN v_request.job_description LIKE '%' || E'\n\nNotes: ' || '%' THEN
           E'\n\nNotes: ' || split_part(v_request.job_description,E'\n\nNotes: ',2) ELSE '' END
    WHERE id=v_request.id;
  END IF;
END;
$$;


CREATE OR REPLACE FUNCTION public.save_punchlist_staff_note(p_task_id uuid,p_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.punchlist_tasks;
BEGIN
 SELECT * INTO t FROM public.punchlist_tasks WHERE id=p_task_id;
 IF NOT FOUND OR NOT private.punchlist_staff_access(t.organization_id) THEN RAISE EXCEPTION 'Staff note access denied' USING ERRCODE='42501'; END IF;
 INSERT INTO public.punchlist_staff_notes(task_id,organization_id,notes,updated_at) VALUES(t.id,t.organization_id,nullif(btrim(p_notes),''),now())
 ON CONFLICT(task_id) DO UPDATE SET notes=EXCLUDED.notes,updated_at=EXCLUDED.updated_at;
END; $$;
REVOKE ALL ON FUNCTION public.save_punchlist_staff_note(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_punchlist_staff_note(uuid,text) TO authenticated;

-- Notes-bearing staff records remain internal even if a portal account has a profile row.
CREATE OR REPLACE FUNCTION private.punchlist_staff_identity(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND NOT coalesce((auth.jwt()->'app_metadata'->>'is_portal_user')::boolean,false)
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=p_org AND p.is_active AND p.contact_id IS NULL AND p.role NOT IN ('portal_user','customer','portal','client'));
$$;
REVOKE ALL ON FUNCTION private.punchlist_staff_identity(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.punchlist_staff_identity(uuid) TO authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['work_orders','work_order_tasks','work_order_task_updates','job_completions','punchlist_task_history'] LOOP
  IF to_regclass('public.'||t) IS NOT NULL THEN
   EXECUTE format('CREATE POLICY staff_note_privacy ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING(private.punchlist_staff_identity(organization_id))',t);
  END IF;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.accept_punchlist_invitation(p_contact_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid;
BEGIN
 SELECT organization_id INTO v_org FROM public.contacts WHERE id=p_contact_id;
 IF v_org IS NULL OR NOT (private.punchlist_portal_identity(p_contact_id,v_org) OR private.punchlist_grant_manager(v_org)) THEN RAISE EXCEPTION 'Invitation access denied' USING ERRCODE='42501'; END IF;
 UPDATE public.punchlist_access_grants SET status='active',notes=coalesce(notes||' | ','')||'Accepted by customer on '||CURRENT_DATE::text,updated_at=now()
 WHERE contact_id=p_contact_id AND organization_id=v_org AND status='pending' AND (expiration_date IS NULL OR expiration_date>=CURRENT_DATE);
END; $$;
REVOKE ALL ON FUNCTION public.accept_punchlist_invitation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_punchlist_invitation(uuid) TO authenticated;
