-- Flow records meaningful actions once, independently of notification preferences.
-- Existing histories remain authoritative. No synthetic historical events are seeded.
CREATE SCHEMA IF NOT EXISTS flow_private;
REVOKE ALL ON SCHEMA flow_private FROM PUBLIC, anon, authenticated;

CREATE TABLE public.flow_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  contact_id uuid,
  project_id uuid,
  work_order_id uuid,
  customer_location_id uuid,
  office_id uuid,
  actor_id uuid,
  actor_name text NOT NULL,
  customer_name text NOT NULL DEFAULT '',
  project_name text NOT NULL DEFAULT '',
  work_order_number text NOT NULL DEFAULT '',
  location_name text NOT NULL DEFAULT '',
  category text NOT NULL CHECK (category IN ('work','service','sales','materials','scheduling','customer','financial','update')),
  event_type text NOT NULL,
  summary text NOT NULL,
  details text NOT NULL DEFAULT '',
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  required_module text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX flow_events_org_page ON public.flow_events(organization_id, id DESC);
CREATE INDEX flow_events_contact_page ON public.flow_events(organization_id, contact_id, id DESC);
CREATE INDEX flow_events_project_page ON public.flow_events(organization_id, project_id, id DESC);
CREATE INDEX flow_events_wo_page ON public.flow_events(organization_id, work_order_id, id DESC);
CREATE INDEX flow_events_office_page ON public.flow_events(organization_id, office_id, id DESC);
CREATE INDEX flow_events_category_page ON public.flow_events(organization_id, category, id DESC);
CREATE INDEX flow_events_actor_page ON public.flow_events(organization_id, actor_id, id DESC);

CREATE TABLE public.flow_event_views (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id bigint NOT NULL REFERENCES public.flow_events(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,event_id)
);
CREATE INDEX flow_event_views_event ON public.flow_event_views(event_id);

CREATE TABLE public.flow_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  contact_id uuid,
  project_id uuid,
  work_order_id uuid,
  author_id uuid NOT NULL DEFAULT auth.uid(),
  update_type text NOT NULL DEFAULT 'update' CHECK (update_type IN ('update','working_issue','customer_contact','material_issue','scheduling_issue','resolved')),
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(contact_id,project_id,work_order_id) > 0)
);

-- Mirrors DepartmentContext: explicit user override, then admin, then role grant.
-- SECURITY INVOKER: permission tables retain their existing RLS.
CREATE FUNCTION public.flow_has_module_access(p_module text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT NOT EXISTS (
   SELECT 1 FROM public.user_permission_overrides o JOIN public.department_modules m ON m.id=o.module_id
   WHERE o.user_id=(SELECT auth.uid()) AND m.module_key=p_module AND m.is_active AND o.override_type='revoke'
 ) AND EXISTS (
   SELECT 1 FROM public.profiles p
   JOIN public.department_modules m ON m.module_key=p_module AND m.is_active
   LEFT JOIN public.user_permission_overrides o ON o.user_id=p.id AND o.module_id=m.id
   LEFT JOIN public.role_module_access r ON r.role_id=p.role_id AND r.module_id=m.id
   WHERE p.id=(SELECT auth.uid()) AND p.organization_id IS NOT NULL
   AND CASE WHEN o.override_type='revoke' THEN false WHEN o.override_type='grant' THEN true
       WHEN p.role='admin' THEN true ELSE coalesce(r.has_access,false) END
 );
$$;
REVOKE ALL ON FUNCTION public.flow_has_module_access(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flow_has_module_access(text) TO authenticated;

ALTER TABLE public.flow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_event_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flow_events,public.flow_event_views,public.flow_updates FROM anon,authenticated;
GRANT SELECT ON public.flow_events TO authenticated;
GRANT SELECT,INSERT,DELETE ON public.flow_event_views TO authenticated;
GRANT INSERT ON public.flow_updates TO authenticated;

CREATE POLICY flow_events_read ON public.flow_events FOR SELECT TO authenticated USING (
 organization_id=(SELECT public.get_user_org_id())
 AND public.flow_has_module_access(required_module)
 AND (NOT is_internal OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role IN ('admin','manager','service_manager','production_manager')))
);
CREATE POLICY flow_views_read ON public.flow_event_views FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
CREATE POLICY flow_views_add ON public.flow_event_views FOR INSERT TO authenticated WITH CHECK (
 user_id=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.flow_events e WHERE e.id=event_id)
);
CREATE POLICY flow_views_remove ON public.flow_event_views FOR DELETE TO authenticated USING (user_id=(SELECT auth.uid()));
CREATE POLICY flow_updates_add ON public.flow_updates FOR INSERT TO authenticated WITH CHECK (
 author_id=(SELECT auth.uid()) AND organization_id=(SELECT public.get_user_org_id())
 AND public.flow_has_module_access(CASE WHEN work_order_id IS NOT NULL THEN 'work_orders' WHEN project_id IS NOT NULL THEN 'projects' ELSE 'contacts' END)
);

-- This trigger normalizes linked records before RLS checks. It rejects inconsistent
-- or cross-tenant references; clients cannot choose a different actor or timestamp.
CREATE FUNCTION flow_private.validate_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_org uuid; w public.work_orders; p public.projects; c public.contacts;
BEGIN
 SELECT organization_id INTO v_org FROM public.profiles WHERE id=auth.uid();
 IF v_org IS NULL THEN RAISE EXCEPTION 'An employee account is required'; END IF;
 IF NEW.organization_id IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'Invalid organization'; END IF;
 IF NEW.work_order_id IS NOT NULL THEN
  SELECT * INTO w FROM public.work_orders WHERE id=NEW.work_order_id AND organization_id=v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Work order is not accessible'; END IF;
  IF NEW.project_id IS NOT NULL AND NEW.project_id IS DISTINCT FROM w.project_id THEN RAISE EXCEPTION 'Work order and project do not match'; END IF;
  IF NEW.contact_id IS NOT NULL AND NEW.contact_id IS DISTINCT FROM w.contact_id THEN RAISE EXCEPTION 'Work order and customer do not match'; END IF;
  NEW.project_id=w.project_id; NEW.contact_id=w.contact_id;
 END IF;
 IF NEW.project_id IS NOT NULL THEN
  SELECT * INTO p FROM public.projects WHERE id=NEW.project_id AND organization_id=v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project is not accessible'; END IF;
  IF NEW.contact_id IS NOT NULL AND NEW.contact_id IS DISTINCT FROM p.contact_id THEN RAISE EXCEPTION 'Project and customer do not match'; END IF;
  NEW.contact_id=p.contact_id;
 END IF;
 SELECT * INTO c FROM public.contacts WHERE id=NEW.contact_id AND organization_id=v_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer is not accessible'; END IF;
 NEW.author_id=auth.uid(); NEW.created_at=now(); NEW.body=trim(NEW.body);
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION flow_private.validate_update() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER flow_update_validate BEFORE INSERT ON public.flow_updates FOR EACH ROW EXECUTE FUNCTION flow_private.validate_update();

-- Called only by trusted database triggers. It snapshots readable labels but never
-- copies financial values, customer credentials, private billing notes, or GPS data.
CREATE FUNCTION flow_private.capture_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 n jsonb=to_jsonb(NEW); o jsonb; v_org uuid; v_contact uuid; v_project uuid; v_wo uuid;
 v_office uuid; v_location uuid; v_module text; v_category text; v_title text; v_summary text;
 v_details text=''; v_internal boolean=false; v_actor uuid; v_actor_name text;
 w jsonb; p jsonb; c jsonb; linked jsonb; changes text[]='{}'; k text; fields text[];
BEGIN
 IF TG_OP='UPDATE' THEN o=to_jsonb(OLD); ELSE o='{}'::jsonb; END IF;
 v_org=nullif(n->>'organization_id','')::uuid;
 v_contact=nullif(coalesce(n->>'contact_id',n->>'customer_contact_id'),'')::uuid;
 v_project=nullif(n->>'project_id','')::uuid; v_wo=nullif(n->>'work_order_id','')::uuid;
 v_office=nullif(n->>'office_id','')::uuid; v_location=nullif(n->>'customer_location_id','')::uuid;
 CASE TG_TABLE_NAME
 WHEN 'work_orders' THEN v_wo=NEW.id; v_module='work_orders'; v_category='work'; v_title='Work order';
  fields=ARRAY['status','assigned_to','scheduled_date','scheduled_start_time','scheduled_end_time','start_date','description','current_location_status','customer_contacted'];
 WHEN 'projects' THEN v_project=NEW.id; v_module='projects'; v_category='work'; v_title='Project';
  fields=ARRAY['status','assigned_pm','salesperson_id','designer_id','substantial_completion_date','test_tune_started_at'];
 WHEN 'service_requests' THEN v_module='service_requests'; v_category='service'; v_title='Service request';
  fields=ARRAY['status','work_order_id','requested_date','requested_time','customer_contact_confirmed_at'];
 WHEN 'change_orders' THEN v_module='change_orders'; v_category='sales'; v_title='Change order '||coalesce(n->>'change_order_number','');
  fields=ARRAY['status','customer_approved','description'];
 WHEN 'product_requests' THEN v_module='parts_requests'; v_category='materials'; v_title='Parts request';
  fields=ARRAY['status','assigned_to'];
 WHEN 'proposals' THEN v_module='proposals'; v_category='sales'; v_title='Proposal '||coalesce(n->>'proposal_number','');
  fields=ARRAY['status','sent_at','approved_at','declined_at'];
 WHEN 'invoices' THEN v_module='invoices'; v_category='financial'; v_title='Invoice '||coalesce(n->>'invoice_number','');
  fields=ARRAY['status'];
 WHEN 'payments' THEN
  SELECT to_jsonb(i) INTO linked FROM public.invoices i WHERE i.id=(n->>'invoice_id')::uuid AND i.organization_id=v_org;
  IF linked IS NULL THEN RETURN NEW; END IF;
  v_contact=(linked->>'contact_id')::uuid; v_project=(linked->>'project_id')::uuid; v_office=(linked->>'office_id')::uuid;
  v_module='invoices'; v_category='financial'; v_title='Payment recorded for invoice '||coalesce(linked->>'invoice_number','');
  IF TG_OP<>'INSERT' THEN RETURN NEW; END IF; v_summary=v_title;
 WHEN 'contacts' THEN v_contact=NEW.id; v_module='contacts'; v_category='customer'; v_title='Customer';
  fields=ARRAY['assigned_to','phone','email','street_address','city','state','zip_code'];
 WHEN 'project_notes' THEN v_module='projects'; v_category='update'; v_title='Project note';
  v_summary='Project note added'; v_details='Open the project to read the current note.'; v_internal=coalesce((n->>'is_internal')::boolean,false);
 WHEN 'customer_contact_log' THEN
  IF v_wo IS NULL AND n->>'service_request_id' IS NOT NULL THEN
   SELECT to_jsonb(s) INTO linked FROM public.service_requests s WHERE s.id=(n->>'service_request_id')::uuid AND s.organization_id=v_org;
   v_contact=(linked->>'contact_id')::uuid; v_project=(linked->>'project_id')::uuid;
  END IF;
  v_module=CASE WHEN v_wo IS NOT NULL THEN 'work_orders' ELSE 'service_requests' END;
  v_category='customer'; v_title='Customer contacted'; v_summary=v_title;
  -- The authoritative log remains available in the work order. Its notes are not copied.
 WHEN 'flow_updates' THEN
  v_module=CASE WHEN v_wo IS NOT NULL THEN 'work_orders' WHEN v_project IS NOT NULL THEN 'projects' ELSE 'contacts' END;
  v_category='update'; v_title=initcap(replace(n->>'update_type','_',' ')); v_summary=v_title||': '||left(n->>'body',110); v_details=n->>'body';
 ELSE RETURN NEW;
 END CASE;
 IF v_org IS NULL THEN RETURN NEW; END IF;
 IF v_summary IS NULL THEN
  IF TG_OP='INSERT' THEN v_summary=v_title||' created';
  ELSE
   FOREACH k IN ARRAY fields LOOP
    IF (n->k) IS DISTINCT FROM (o->k) THEN
     IF k='status' THEN changes=array_append(changes,replace(coalesce(n->>k,'cleared'),'_',' '));
     ELSIF k IN ('assigned_to','assigned_pm','salesperson_id','designer_id') THEN changes=array_append(changes,'assignment changed');
     ELSIF k IN ('scheduled_date','scheduled_start_time','scheduled_end_time','start_date','requested_date','requested_time') THEN changes=array_append(changes,'schedule changed'); v_category='scheduling';
     ELSIF k='description' THEN changes=array_append(changes,'scope updated');
     ELSIF k='current_location_status' THEN changes=array_append(changes,replace(coalesce(n->>k,'status cleared'),'_',' '));
     ELSIF k='customer_approved' AND n->>k='true' THEN changes=array_append(changes,'customer approved');
     ELSE changes=array_append(changes,replace(k,'_',' ')||' updated'); END IF;
     -- Only allowlisted operational transitions, never arbitrary record JSON.
     IF k IN ('status','scheduled_date','scheduled_start_time','scheduled_end_time','start_date','requested_date','requested_time','current_location_status') THEN
      v_details=v_details||initcap(replace(k,'_',' '))||': '||coalesce(o->>k,'Not set')||' → '||coalesce(n->>k,'Not set')||E'\n';
     END IF;
    END IF;
   END LOOP;
   IF cardinality(changes)=0 THEN RETURN NEW; END IF;
   SELECT array_agg(DISTINCT x) INTO changes FROM unnest(changes) x;
   v_summary=v_title||' · '||array_to_string(changes,' · ');
  END IF;
 END IF;
 IF v_wo IS NOT NULL THEN
  SELECT to_jsonb(x) INTO w FROM public.work_orders x WHERE x.id=v_wo AND x.organization_id=v_org;
  IF w IS NULL THEN RETURN NEW; END IF;
  v_project=coalesce(v_project,(w->>'project_id')::uuid); v_contact=coalesce(v_contact,(w->>'contact_id')::uuid);
  v_office=coalesce(v_office,(w->>'office_id')::uuid); v_location=coalesce(v_location,(w->>'customer_location_id')::uuid);
 END IF;
 IF v_project IS NOT NULL THEN
  SELECT to_jsonb(x) INTO p FROM public.projects x WHERE x.id=v_project AND x.organization_id=v_org;
  IF p IS NULL THEN RETURN NEW; END IF;
  v_contact=coalesce(v_contact,(p->>'contact_id')::uuid); v_office=coalesce(v_office,(p->>'office_id')::uuid); v_location=coalesce(v_location,(p->>'customer_location_id')::uuid);
 END IF;
 IF v_contact IS NOT NULL THEN
  SELECT to_jsonb(x) INTO c FROM public.contacts x WHERE x.id=v_contact AND x.organization_id=v_org;
  IF c IS NULL THEN RETURN NEW; END IF;
  v_office=coalesce(v_office,(c->>'office_id')::uuid);
 END IF;
 IF num_nonnulls(v_contact,v_project,v_wo)=0 THEN RETURN NEW; END IF;
 SELECT id,full_name INTO v_actor,v_actor_name FROM public.profiles WHERE id=auth.uid() AND organization_id=v_org;
 IF v_actor IS NULL THEN v_actor_name=CASE WHEN auth.uid() IS NULL THEN 'System' ELSE 'Customer / integration' END; END IF;
 INSERT INTO public.flow_events(organization_id,contact_id,project_id,work_order_id,customer_location_id,office_id,actor_id,actor_name,customer_name,project_name,work_order_number,location_name,category,event_type,summary,details,source_table,source_id,required_module,is_internal)
 VALUES(v_org,v_contact,v_project,v_wo,v_location,v_office,v_actor,coalesce(v_actor_name,'Team member'),
 coalesce(nullif(c->>'full_name',''),nullif(c->>'contact_name',''),nullif(c->>'company_name',''),'Customer'),
 coalesce(p->>'name',''),coalesce(w->>'work_order_number',''),
 coalesce((SELECT l.name FROM public.customer_locations l WHERE l.id=v_location AND l.customer_contact_id=v_contact),''),
 v_category,TG_TABLE_NAME||'.'||lower(TG_OP),v_summary,coalesce(v_details,''),TG_TABLE_NAME,NEW.id,v_module,v_internal);
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION flow_private.capture_event() FROM PUBLIC,anon,authenticated;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['work_orders','projects','service_requests','change_orders','product_requests','proposals','invoices','contacts'] LOOP
  EXECUTE format('CREATE TRIGGER capture_flow_event AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION flow_private.capture_event()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['payments','project_notes','customer_contact_log','flow_updates'] LOOP
  EXECUTE format('CREATE TRIGGER capture_flow_event AFTER INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION flow_private.capture_event()',t);
 END LOOP;
END $$;

-- My Work resolves current assignments, so reassignment also changes the feed scope.
CREATE FUNCTION public.get_flow_events(p_filters jsonb DEFAULT '{}'::jsonb, p_before bigint DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT to_jsonb(e)||jsonb_build_object('viewed',v.event_id IS NOT NULL)
 FROM public.flow_events e LEFT JOIN public.flow_event_views v ON v.event_id=e.id AND v.user_id=(SELECT auth.uid())
 WHERE (p_before IS NULL OR e.id<p_before)
 AND (nullif(p_filters->>'contact_id','') IS NULL OR e.contact_id=(p_filters->>'contact_id')::uuid)
 AND (nullif(p_filters->>'project_id','') IS NULL OR e.project_id=(p_filters->>'project_id')::uuid)
 AND (nullif(p_filters->>'work_order_id','') IS NULL OR e.work_order_id=(p_filters->>'work_order_id')::uuid)
 AND (nullif(p_filters->>'location_id','') IS NULL OR e.customer_location_id=(p_filters->>'location_id')::uuid)
 AND (nullif(p_filters->>'office_id','') IS NULL OR e.office_id=(p_filters->>'office_id')::uuid)
 AND (nullif(p_filters->>'actor_id','') IS NULL OR e.actor_id=(p_filters->>'actor_id')::uuid)
 AND (nullif(p_filters->>'category','') IS NULL OR e.category=p_filters->>'category')
 AND (nullif(p_filters->>'since','') IS NULL OR e.created_at>=(p_filters->>'since')::timestamptz)
 AND (nullif(p_filters->>'until','') IS NULL OR e.created_at<(p_filters->>'until')::timestamptz)
 AND (NOT coalesce((p_filters->>'new_only')::boolean,false) OR v.event_id IS NULL)
 AND (nullif(trim(p_filters->>'search'),'') IS NULL OR
  position(lower(trim(p_filters->>'search')) IN lower(concat_ws(' ',e.customer_name,e.project_name,e.work_order_number,e.location_name,e.summary,e.actor_name)))>0)
 AND (NOT coalesce((p_filters->>'my_work')::boolean,false) OR e.actor_id=(SELECT auth.uid())
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id=e.project_id AND p.organization_id=e.organization_id AND (SELECT auth.uid()) IN (p.assigned_pm,p.salesperson_id,p.designer_id))
  OR EXISTS (SELECT 1 FROM public.work_orders w WHERE w.organization_id=e.organization_id AND (w.id=e.work_order_id OR (e.project_id IS NOT NULL AND w.project_id=e.project_id)) AND (SELECT auth.uid()) IN (w.assigned_to,w.customer_sales_rep_id))
  OR EXISTS (SELECT 1 FROM public.contacts c WHERE c.id=e.contact_id AND c.organization_id=e.organization_id AND c.assigned_to=(SELECT auth.uid()))
 )
 ORDER BY e.id DESC LIMIT least(greatest(p_limit,1),100);
$$;
REVOKE ALL ON FUNCTION public.get_flow_events(jsonb,bigint,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_flow_events(jsonb,bigint,integer) TO authenticated;

-- Append-only events and personal view markers have separate publication entries.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.flow_events,public.flow_event_views;
 END IF;
END $$;
COMMENT ON TABLE public.flow_events IS 'Employee Flow. Immutable operational events independent of notifications. No historical backfill.';

CREATE FUNCTION public.search_flow_targets(p_search text DEFAULT '',p_contact uuid DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH matches AS (
  (SELECT 'contact'::text AS kind,c.id,
    coalesce(nullif(c.full_name,''),nullif(c.contact_name,''),nullif(c.company_name,''),'Customer') AS label
   FROM public.contacts c WHERE c.organization_id=(SELECT public.get_user_org_id()) AND public.flow_has_module_access('contacts')
   AND (p_contact IS NULL OR c.id=p_contact)
   AND position(lower(trim(p_search)) IN lower(concat_ws(' ',c.full_name,c.contact_name,c.company_name)))>0
   ORDER BY c.updated_at DESC NULLS LAST LIMIT 8)
  UNION ALL
  (SELECT 'project',p.id,concat_ws(' · ',p.project_number,p.name)
   FROM public.projects p WHERE p.organization_id=(SELECT public.get_user_org_id()) AND public.flow_has_module_access('projects')
   AND (p_contact IS NULL OR p.contact_id=p_contact)
   AND position(lower(trim(p_search)) IN lower(concat_ws(' ',p.project_number,p.name)))>0
   ORDER BY p.created_at DESC LIMIT 8)
  UNION ALL
  (SELECT 'work_order',w.id,concat_ws(' · ',w.work_order_number,w.title)
   FROM public.work_orders w WHERE w.organization_id=(SELECT public.get_user_org_id()) AND public.flow_has_module_access('work_orders')
   AND (p_contact IS NULL OR w.contact_id=p_contact)
   AND position(lower(trim(p_search)) IN lower(concat_ws(' ',w.work_order_number,w.title)))>0
   ORDER BY w.created_at DESC LIMIT 8)
 ) SELECT to_jsonb(matches) FROM matches;
$$;
REVOKE ALL ON FUNCTION public.search_flow_targets(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.search_flow_targets(text,uuid) TO authenticated;

-- Keep the existing navigation and grants while exposing the new default view.
UPDATE public.department_modules SET display_name='Flow' WHERE module_key='feed';
