-- Reconcile VIP Maintenance workflow for databases that already applied earlier draft migrations.
-- This migration is intentionally additive/replacing so deployed environments converge without replaying old files.

ALTER TABLE public.vip_maintenance_findings
  ADD COLUMN IF NOT EXISTS punchlist_task_id uuid REFERENCES public.punchlist_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS routed_at timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_type text,
  ADD COLUMN IF NOT EXISTS follow_up_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL;
ALTER TABLE public.vip_maintenance_visits ADD COLUMN IF NOT EXISTS sales_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='vip_maintenance_findings_follow_up_type_check') THEN
    ALTER TABLE public.vip_maintenance_findings ADD CONSTRAINT vip_maintenance_findings_follow_up_type_check CHECK (follow_up_type IS NULL OR follow_up_type IN ('punchlist','task'));
  END IF;
END $$;


-- Once a Finding has created downstream work, keep its routing attached to that Finding.
CREATE OR REPLACE FUNCTION public.guard_vip_finding_routing_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF OLD.follow_up_task_id IS NOT NULL AND
     (NEW.dispositions IS DISTINCT FROM OLD.dispositions OR NEW.follow_up_type IS DISTINCT FROM OLD.follow_up_type OR NEW.follow_up_task_id IS DISTINCT FROM OLD.follow_up_task_id) THEN
    RAISE EXCEPTION 'This VIP finding already created a Task. Its follow-up routing cannot be changed.';
  END IF;
  IF OLD.punchlist_task_id IS NOT NULL AND
     (NEW.dispositions IS DISTINCT FROM OLD.dispositions OR NEW.follow_up_type IS DISTINCT FROM OLD.follow_up_type OR NEW.punchlist_task_id IS DISTINCT FROM OLD.punchlist_task_id) THEN
    RAISE EXCEPTION 'This VIP finding already created a Punchlist item. Its follow-up routing cannot be changed.';
  END IF;
  IF NEW.follow_up_task_id IS NOT NULL AND (NEW.follow_up_type IS DISTINCT FROM 'task' OR NOT ('punchlist'=ANY(NEW.dispositions))) THEN
    RAISE EXCEPTION 'A linked Task requires Needs Follow-Up routed to Task.';
  END IF;
  IF NEW.punchlist_task_id IS NOT NULL AND (NEW.follow_up_type IS DISTINCT FROM 'punchlist' OR NOT ('punchlist'=ANY(NEW.dispositions))) THEN
    RAISE EXCEPTION 'A linked Punchlist item requires Needs Follow-Up routed to Service / Technical Work.';
  END IF;
  IF NEW.follow_up_task_id IS NOT NULL AND NEW.punchlist_task_id IS NOT NULL THEN
    RAISE EXCEPTION 'A VIP finding can route to either a Task or Punchlist item, not both.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_vip_finding_routing_change ON public.vip_maintenance_findings;
CREATE TRIGGER guard_vip_finding_routing_change BEFORE UPDATE ON public.vip_maintenance_findings
FOR EACH ROW EXECUTE FUNCTION public.guard_vip_finding_routing_change();

CREATE OR REPLACE FUNCTION public.guard_vip_finding_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF OLD.follow_up_task_id IS NOT NULL OR OLD.punchlist_task_id IS NOT NULL THEN
    RAISE EXCEPTION 'A VIP finding that created downstream work cannot be deleted.';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS guard_vip_finding_delete ON public.vip_maintenance_findings;
CREATE TRIGGER guard_vip_finding_delete BEFORE DELETE ON public.vip_maintenance_findings
FOR EACH ROW EXECUTE FUNCTION public.guard_vip_finding_delete();

REVOKE ALL ON FUNCTION public.guard_vip_finding_routing_change(),public.guard_vip_finding_delete() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.guard_vip_finding_routing_change(),public.guard_vip_finding_delete() TO authenticated;

CREATE OR REPLACE FUNCTION public.link_vip_follow_up_task(p_finding_id uuid,p_task_id uuid)
RETURNS public.vip_maintenance_findings
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $vip_task_link$
DECLARE f public.vip_maintenance_findings%ROWTYPE; p public.profiles%ROWTYPE; t public.tasks%ROWTYPE; v public.vip_maintenance_visits%ROWTYPE; w public.work_orders%ROWTYPE;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE id=auth.uid() AND is_active AND contact_id IS NULL;
 SELECT * INTO f FROM public.vip_maintenance_findings WHERE id=p_finding_id FOR UPDATE;
 IF NOT FOUND OR p.organization_id IS DISTINCT FROM f.organization_id THEN RAISE EXCEPTION 'Finding not found' USING ERRCODE='42501'; END IF;
 IF f.follow_up_task_id IS NOT NULL THEN RETURN f; END IF;
 IF cardinality(f.dispositions)<>1 OR NOT ('punchlist'=ANY(f.dispositions)) OR f.follow_up_type IS DISTINCT FROM 'task' THEN
   RAISE EXCEPTION 'Finding must be Needs Follow-Up routed to Task before linking a Task.';
 END IF;
 SELECT * INTO v FROM public.vip_maintenance_visits WHERE id=f.visit_id;
 SELECT * INTO w FROM public.work_orders WHERE id=v.work_order_id;
 SELECT * INTO t FROM public.tasks WHERE id=p_task_id;
 IF NOT FOUND OR t.contact_id IS DISTINCT FROM w.contact_id THEN RAISE EXCEPTION 'Task does not belong to this VIP customer.' USING ERRCODE='42501'; END IF;
 UPDATE public.vip_maintenance_findings SET follow_up_task_id=p_task_id,routed_at=now(),updated_at=now() WHERE id=f.id RETURNING * INTO f;
 RETURN f;
END $vip_task_link$;
REVOKE ALL ON FUNCTION public.link_vip_follow_up_task(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.link_vip_follow_up_task(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.route_vip_maintenance_finding(p_finding_id uuid)
RETURNS public.vip_maintenance_findings
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 f public.vip_maintenance_findings%ROWTYPE; v public.vip_maintenance_visits%ROWTYPE; w public.work_orders%ROWTYPE;
 p public.profiles%ROWTYPE;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE id=auth.uid() AND is_active AND contact_id IS NULL;
 SELECT * INTO f FROM public.vip_maintenance_findings WHERE id=p_finding_id FOR UPDATE;
 IF NOT FOUND OR p.organization_id IS DISTINCT FROM f.organization_id THEN RAISE EXCEPTION 'Finding not found' USING ERRCODE='42501'; END IF;
 IF cardinality(f.dispositions)<>1 THEN RAISE EXCEPTION 'Choose exactly one finding outcome'; END IF;
 IF NOT ('punchlist'=ANY(f.dispositions)) THEN RAISE EXCEPTION 'Only Needs Follow-Up findings can be routed.'; END IF;
 IF f.follow_up_type IS DISTINCT FROM 'punchlist' THEN RAISE EXCEPTION 'Choose Service / Technical Work before creating a Punchlist item.'; END IF;
 IF nullif(btrim(f.description),'') IS NULL THEN RAISE EXCEPTION 'Describe what needs follow-up before creating a Punchlist item'; END IF;
 IF 'no_action'=ANY(f.dispositions) AND coalesce(nullif(btrim(f.notes),''),'')='' THEN RAISE EXCEPTION 'A reason is required when No Action is selected.'; END IF;
 SELECT * INTO v FROM public.vip_maintenance_visits WHERE id=f.visit_id;
 SELECT wo.* INTO w FROM public.work_orders wo
 JOIN public.contacts wc ON wc.id=wo.contact_id AND wc.organization_id=f.organization_id
 WHERE wo.id=v.work_order_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'VIP Work Order not found in this organization' USING ERRCODE='42501'; END IF;
 IF 'punchlist'=ANY(f.dispositions) AND f.punchlist_task_id IS NULL THEN
   INSERT INTO public.punchlist_tasks(organization_id,contact_id,title,details,status,priority_order)
   VALUES(f.organization_id,w.contact_id,left(f.description,120),f.description,'draft',
     coalesce((SELECT max(priority_order)+1 FROM public.punchlist_tasks WHERE contact_id=w.contact_id),0))
   RETURNING id INTO f.punchlist_task_id;
 END IF;


 UPDATE public.vip_maintenance_findings SET punchlist_task_id=f.punchlist_task_id,routed_at=now(),updated_at=now() WHERE id=f.id RETURNING * INTO f;
 RETURN f;
END $$;
REVOKE ALL ON FUNCTION public.route_vip_maintenance_finding(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.route_vip_maintenance_finding(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.route_vip_maintenance_finding(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.route_vip_maintenance_finding(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.vip_maintenance_incomplete_sections(p_work_order_id uuid)
RETURNS text[] LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v vip_maintenance_visits; missing text[] := '{}'; section text;
BEGIN
 SELECT vmv.* INTO v FROM vip_maintenance_visits vmv WHERE vmv.work_order_id=p_work_order_id;
 IF NOT FOUND THEN RETURN ARRAY['VIP Maintenance']; END IF;
 FOREACH section IN ARRAY ARRAY['customer_check_in','network_internet','av_automation','security_surveillance','room_by_room','preventive_maintenance'] LOOP
   IF NOT (COALESCE((v.responses->section->>'complete')::boolean,false) OR (section <> 'customer_check_in' AND COALESCE((v.responses->section->>'na')::boolean,false)))
   THEN missing:=array_append(missing,section); END IF;
 END LOOP;
 IF NOT (COALESCE((v.responses->'customer_training'->>'complete')::boolean,false) OR v.training_not_needed OR v.customer_not_present)
 THEN missing:=array_append(missing,'customer_training'); END IF;
 IF NOT (v.no_issues_found OR EXISTS(SELECT 1 FROM vip_maintenance_findings x WHERE x.visit_id=v.id))
 THEN missing:=array_append(missing,'findings'); END IF;
 IF v.no_issues_found AND EXISTS(SELECT 1 FROM vip_maintenance_findings x WHERE x.visit_id=v.id)
 THEN missing:=array_append(missing,'findings_consistency'); END IF;
 IF EXISTS(SELECT 1 FROM vip_maintenance_findings x WHERE x.visit_id=v.id AND cardinality(x.dispositions)<>1)
 THEN missing:=array_append(missing,'finding_dispositions'); END IF;
 IF EXISTS(SELECT 1 FROM vip_maintenance_findings x WHERE x.visit_id=v.id AND nullif(btrim(x.description),'') IS NULL)
 THEN missing:=array_append(missing,'finding_description'); END IF;
 IF EXISTS(SELECT 1 FROM vip_maintenance_findings x WHERE x.visit_id=v.id AND 'no_action'=ANY(x.dispositions) AND coalesce(nullif(btrim(x.notes),''),'')='')
 THEN missing:=array_append(missing,'no_action_reason'); END IF;
 IF EXISTS(SELECT 1 FROM vip_maintenance_findings x WHERE x.visit_id=v.id AND 'punchlist'=ANY(x.dispositions) AND x.follow_up_type IS NULL)
 THEN missing:=array_append(missing,'follow_up_type'); END IF;
 IF EXISTS(SELECT 1 FROM vip_maintenance_findings x WHERE x.visit_id=v.id AND 'punchlist'=ANY(x.dispositions) AND
   ((x.follow_up_type='punchlist' AND x.punchlist_task_id IS NULL) OR (x.follow_up_type='task' AND x.follow_up_task_id IS NULL)))
 THEN missing:=array_append(missing,'unrouted_findings'); END IF;
 IF NOT (v.no_opportunities_identified OR nullif(btrim(v.responses->'sales_lead'->>'notes'),'') IS NOT NULL)
 THEN missing:=array_append(missing,'sales_lead'); END IF;
 IF NOT (v.customer_not_present OR v.customer_acknowledged_at IS NOT NULL)
 THEN missing:=array_append(missing,'customer_acknowledgment'); END IF;
 RETURN missing;
END $$;

CREATE OR REPLACE FUNCTION public.guard_vip_work_order_archive()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE missing text[];
BEGIN
 IF NEW.is_archived IS TRUE AND COALESCE(OLD.is_archived,false) IS FALSE
 AND EXISTS (SELECT 1 FROM work_order_options o WHERE o.id=NEW.work_order_type_id AND o.system_key='vip_program') THEN
   missing:=vip_maintenance_incomplete_sections(NEW.id);
   IF cardinality(missing)>0 THEN
     RAISE EXCEPTION 'VIP Maintenance cannot be archived until complete: %',array_to_string(missing,', ');
   END IF;
   IF NOT EXISTS (SELECT 1 FROM vip_maintenance_visits v WHERE v.work_order_id=NEW.id AND v.completed_at IS NOT NULL) THEN
     RAISE EXCEPTION 'VIP Maintenance must be completed before it can be archived.';
   END IF;
 END IF;
 RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.guard_vip_work_order_archive() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.guard_vip_work_order_archive() TO authenticated;

DROP TRIGGER IF EXISTS guard_vip_work_order_archive ON public.work_orders;
CREATE TRIGGER guard_vip_work_order_archive
BEFORE UPDATE OF is_archived ON public.work_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_vip_work_order_archive();

DO $
DECLARE constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid=con.conrelid
  JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace
  WHERE nsp.nspname='public' AND rel.relname='leads' AND con.contype='c'
    AND pg_get_constraintdef(con.oid) ILIKE '%lead_source%'
  LIMIT 1;
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.leads DROP CONSTRAINT %I',constraint_name);
  END IF;
END $;
ALTER TABLE public.leads ADD CONSTRAINT leads_lead_source_check
CHECK (lead_source IN ('manual','kiosk','website','referral','import','other','email_forward','vip_maintenance'));

CREATE OR REPLACE FUNCTION public.create_vip_sales_lead(p_work_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.vip_maintenance_visits%ROWTYPE; w public.work_orders%ROWTYPE; c public.contacts%ROWTYPE; lead jsonb; lead_id uuid; rep uuid; descr text;
BEGIN
 SELECT * INTO v FROM public.vip_maintenance_visits WHERE work_order_id=p_work_order_id FOR UPDATE;
 IF NOT FOUND OR v.no_opportunities_identified THEN RETURN NULL; END IF;
 IF v.sales_lead_id IS NOT NULL THEN RETURN v.sales_lead_id; END IF;
 lead:=v.responses->'sales_lead';
 IF nullif(btrim(lead->>'notes'),'') IS NULL THEN RETURN NULL; END IF;
 SELECT wo.* INTO w FROM public.work_orders wo
 JOIN public.contacts wc ON wc.id=wo.contact_id
 JOIN public.profiles actor ON actor.id=auth.uid() AND actor.is_active AND actor.contact_id IS NULL AND actor.organization_id=wc.organization_id
 WHERE wo.id=p_work_order_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'VIP Work Order not found in this organization' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM public.contacts WHERE id=w.contact_id;
 rep:=w.customer_sales_rep_id;
 IF rep IS NULL THEN RAISE EXCEPTION 'Customer has no assigned sales rep. Assign one before completing this VIP visit.'; END IF;
 descr:=(lead->>'notes') || E'\n\nSource: VIP Maintenance • '||coalesce(w.work_order_number,w.id::text);
 INSERT INTO public.leads(company_name,contact_name,email,phone,opportunity_description,status,assigned_to,created_by,is_fishbowl,claimed_at,lead_source)
 VALUES(c.company_name,coalesce(c.full_name,c.company_name,'Customer'),c.email,c.phone,descr,'claimed',rep,auth.uid(),false,now(),'vip_maintenance') RETURNING id INTO lead_id;
 UPDATE public.vip_maintenance_visits SET sales_lead_id=lead_id,updated_at=now() WHERE id=v.id;
 INSERT INTO public.notifications(user_id,type,lead_id,title,body,is_read)
 SELECT rep,'lead_assigned',lead_id,'New VIP Maintenance Lead',coalesce(c.full_name,c.company_name,'Customer')||' has a new lead from a completed VIP Maintenance visit',false
 WHERE coalesce((SELECT notify_on_lead_assigned FROM public.profiles WHERE id=rep),true);
 INSERT INTO public.feed_events(event_type,lead_id,user_id,metadata) VALUES('lead_created',lead_id,auth.uid(),jsonb_build_object('source','vip_maintenance','work_order_id',w.id,'vip_visit_id',v.id));
 RETURN lead_id;
END $$;

REVOKE ALL ON FUNCTION public.create_vip_sales_lead(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_vip_sales_lead(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_vip_work_order_completion() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE missing text[];
BEGIN
 IF NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed'
 AND EXISTS (SELECT 1 FROM work_order_options o WHERE o.id=NEW.work_order_type_id AND o.system_key='vip_program') THEN
   missing:=vip_maintenance_incomplete_sections(NEW.id);
   IF cardinality(missing)>0 THEN RAISE EXCEPTION 'VIP Maintenance incomplete: %',array_to_string(missing,', '); END IF;
   PERFORM create_vip_sales_lead(NEW.id);
   UPDATE vip_maintenance_visits SET completed_at=COALESCE(completed_at,now()),completed_by=COALESCE(completed_by,auth.uid()),updated_at=now() WHERE work_order_id=NEW.id;
 END IF;
 RETURN NEW;
END $;

DROP TRIGGER IF EXISTS guard_vip_work_order_completion ON public.work_orders;
CREATE TRIGGER guard_vip_work_order_completion
BEFORE UPDATE OF status ON public.work_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_vip_work_order_completion();

CREATE OR REPLACE FUNCTION public.lock_completed_vip_visit()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $vip_visit_lock$
BEGIN
  IF OLD.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Completed VIP Maintenance visits are read-only.';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $vip_visit_lock$;
DROP TRIGGER IF EXISTS lock_completed_vip_visit ON public.vip_maintenance_visits;
CREATE TRIGGER lock_completed_vip_visit BEFORE UPDATE OR DELETE ON public.vip_maintenance_visits
FOR EACH ROW EXECUTE FUNCTION public.lock_completed_vip_visit();

CREATE OR REPLACE FUNCTION public.lock_completed_vip_finding()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $vip_finding_lock$
DECLARE completed timestamptz;
BEGIN
  SELECT completed_at INTO completed FROM public.vip_maintenance_visits
  WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.visit_id ELSE NEW.visit_id END;
  IF completed IS NOT NULL THEN RAISE EXCEPTION 'Findings on a completed VIP Maintenance visit are read-only.'; END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $vip_finding_lock$;
DROP TRIGGER IF EXISTS lock_completed_vip_finding ON public.vip_maintenance_findings;
CREATE TRIGGER lock_completed_vip_finding BEFORE INSERT OR UPDATE OR DELETE ON public.vip_maintenance_findings
FOR EACH ROW EXECUTE FUNCTION public.lock_completed_vip_finding();

REVOKE ALL ON FUNCTION public.lock_completed_vip_visit(),public.lock_completed_vip_finding() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lock_completed_vip_visit(),public.lock_completed_vip_finding() TO authenticated;

CREATE OR REPLACE FUNCTION public.patch_vip_maintenance_response(
  p_visit_id uuid,
  p_section text,
  p_patch jsonb,
  p_clear_no_opportunities boolean DEFAULT false
) RETURNS public.vip_maintenance_visits
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v public.vip_maintenance_visits;
BEGIN
  IF p_section IS NULL OR btrim(p_section)='' OR p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'A VIP response section and object patch are required.';
  END IF;
  IF p_section <> ALL(ARRAY['customer_check_in','network_internet','av_automation','security_surveillance','room_by_room','preventive_maintenance','customer_training','sales_lead','review']) THEN
    RAISE EXCEPTION 'Invalid VIP response section.';
  END IF;
  SELECT * INTO v FROM public.vip_maintenance_visits WHERE id=p_visit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VIP Maintenance visit not found.'; END IF;
  IF v.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Completed VIP Maintenance visits are read-only.'; END IF;
  UPDATE public.vip_maintenance_visits
  SET responses=jsonb_set(
        COALESCE(responses,'{}'::jsonb),
        ARRAY[p_section],
        COALESCE(responses->p_section,'{}'::jsonb) || p_patch,
        true
      ),
      no_opportunities_identified=CASE WHEN p_clear_no_opportunities THEN false ELSE no_opportunities_identified END,
      updated_at=now()
  WHERE id=p_visit_id
  RETURNING * INTO v;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.patch_vip_maintenance_response(uuid,text,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.patch_vip_maintenance_response(uuid,text,jsonb,boolean) TO authenticated;
