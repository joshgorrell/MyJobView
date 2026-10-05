-- Project tasks own the scope. Work-order tasks assign one visit's work.
-- Keep project_tasks.status canonical (open/completed/cancelled) for portal parity.
ALTER TABLE public.work_orders ALTER COLUMN labor_phase_id DROP NOT NULL;
ALTER TABLE public.work_orders ADD COLUMN creation_request_id uuid;
ALTER TABLE public.work_orders ADD COLUMN creation_sequence integer;
CREATE UNIQUE INDEX work_order_creation_retry ON public.work_orders(organization_id, creation_request_id, assigned_to) WHERE creation_request_id IS NOT NULL;
ALTER TABLE public.work_order_tasks ADD COLUMN visit_instructions text;
ALTER TABLE public.work_order_tasks ADD COLUMN progress_version integer NOT NULL DEFAULT 0;
ALTER TABLE public.work_order_tasks DROP CONSTRAINT valid_task_status;
ALTER TABLE public.work_order_tasks ADD CONSTRAINT valid_task_status CHECK (status IN ('pending','in_progress','partial','blocked','completed','cancelled'));
ALTER TABLE public.proposal_tasks ADD COLUMN estimated_hours numeric CHECK(estimated_hours >= 0);
ALTER TABLE public.proposal_tasks ADD COLUMN covered_item_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.project_tasks ADD COLUMN room_name text;
ALTER TABLE public.project_tasks ADD COLUMN covered_items jsonb NOT NULL DEFAULT '[]';
ALTER TABLE public.project_tasks ADD COLUMN progress_status text NOT NULL DEFAULT 'pending' CHECK(progress_status IN ('pending','in_progress','partial','blocked','completed'));
ALTER TABLE public.projects ADD COLUMN sold_handoff jsonb;

CREATE TABLE public.work_order_task_updates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE RESTRICT,
 work_order_task_id uuid NOT NULL REFERENCES public.work_order_tasks(id) ON DELETE RESTRICT,
 project_task_id uuid REFERENCES public.project_tasks(id) ON DELETE RESTRICT,
 technician_id uuid NOT NULL REFERENCES public.profiles(id),
 disposition text NOT NULL CHECK(disposition IN ('pending','in_progress','partial','blocked','completed','reopened')),
 notes text,
 completes_project_task boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_updates_project_history ON public.work_order_task_updates(project_task_id,created_at);
CREATE INDEX task_updates_visit_history ON public.work_order_task_updates(work_order_id,created_at);
ALTER TABLE public.work_order_task_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_updates_read ON public.work_order_task_updates FOR SELECT TO authenticated USING(organization_id=public.get_user_org_id());
GRANT SELECT ON public.work_order_task_updates TO authenticated;
-- Append-only writes go through validated RPC; history never deletes on reopen.
REVOKE ALL ON public.work_order_task_updates FROM anon;

-- A finished assignment is not proof that the entire defined project task is done.
DROP TRIGGER IF EXISTS trigger_auto_complete_project_task ON public.work_order_task_completions;
DROP TRIGGER IF EXISTS trigger_reopen_project_task ON public.work_order_task_completions;

CREATE OR REPLACE FUNCTION public.validate_visit_task_link() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_order public.work_orders; v_project public.project_tasks;
BEGIN
 SELECT * INTO v_order FROM public.work_orders WHERE id=NEW.work_order_id;
 IF NOT FOUND OR v_order.organization_id IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Invalid work-order organization'; END IF;
 IF NEW.assigned_to IS NULL THEN NEW.assigned_to:=v_order.assigned_to; END IF;
 IF NEW.assigned_to IS DISTINCT FROM v_order.assigned_to THEN RAISE EXCEPTION 'Assignment technician must match its work order'; END IF;
 IF NEW.project_task_id IS NOT NULL THEN
  SELECT * INTO v_project FROM public.project_tasks WHERE id=NEW.project_task_id;
  IF NOT FOUND OR v_project.project_id IS DISTINCT FROM v_order.project_id OR v_project.organization_id IS DISTINCT FROM v_order.organization_id THEN RAISE EXCEPTION 'Task belongs to a different project'; END IF;
  IF TG_OP='INSERT' AND v_project.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Task is no longer assignable'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER validate_visit_task_link BEFORE INSERT OR UPDATE OF work_order_id,project_task_id,assigned_to,organization_id ON public.work_order_tasks FOR EACH ROW EXECUTE FUNCTION public.validate_visit_task_link();

CREATE OR REPLACE FUNCTION public.create_work_order_assignments(p_request_id uuid,p_assignments jsonb,p_service_request_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_org uuid:=public.get_user_org_id(); v_entry jsonb; v_task jsonb; v_part jsonb; v_order public.work_orders; v_existing public.work_orders; v_master public.project_tasks; v_result jsonb:='[]'; v_index integer;
BEGIN
 IF auth.uid() IS NULL OR v_org IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Authentication and retry key required'; END IF;
 IF jsonb_typeof(p_assignments)<>'array' OR jsonb_array_length(p_assignments)=0 THEN RAISE EXCEPTION 'Assignments required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text||p_request_id::text,0));
 -- A replay returns the original result; it never adds technicians or tasks.
 IF EXISTS(SELECT 1 FROM public.work_orders WHERE organization_id=v_org AND creation_request_id=p_request_id) THEN
  SELECT jsonb_agg(jsonb_build_object('id',id,'work_order_number',work_order_number) ORDER BY creation_sequence) INTO v_result FROM public.work_orders WHERE organization_id=v_org AND creation_request_id=p_request_id;
  RETURN v_result;
 END IF;
 FOR v_entry IN SELECT value FROM jsonb_array_elements(p_assignments) LOOP
  v_order:=jsonb_populate_record(NULL::public.work_orders,v_entry->'work_order');
  IF v_order.company_id IS DISTINCT FROM v_org OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_order.assigned_to AND organization_id=v_org AND is_active) THEN RAISE EXCEPTION 'Invalid organization or technician'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.contacts WHERE id=v_order.contact_id AND organization_id=v_org) THEN RAISE EXCEPTION 'Invalid customer'; END IF;
  IF v_order.project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.projects WHERE id=v_order.project_id AND organization_id=v_org AND contact_id=v_order.contact_id) THEN RAISE EXCEPTION 'Project/customer mismatch'; END IF;
  -- Remove generated/audit fields; let normal table defaults and triggers run.
  INSERT INTO public.work_orders(company_id,organization_id,contact_id,customer_location_id,project_id,labor_phase_id,labor_category_id,work_order_group_id,title,description,type,is_billable,billable_type,warranty_reference_type,warranty_reference_id,priority,status,assigned_to,start_date,scheduled_date,scheduled_start_time,scheduled_end_time,target_completion_date,estimated_hours,notes,internal_notes,send_appointment_reminder,reminder_email,reminder_sms,customer_contacted,created_by,office_id,is_recurring_parent,recurrence_rule,recurring_subscription_id,work_order_type_id,service_location_address,service_location_city,service_location_state,service_location_zip,address,creation_request_id,creation_sequence)
  VALUES(v_org,v_org,v_order.contact_id,v_order.customer_location_id,v_order.project_id,v_order.labor_phase_id,v_order.labor_category_id,v_order.work_order_group_id,v_order.title,v_order.description,v_order.type,v_order.is_billable,v_order.billable_type,v_order.warranty_reference_type,v_order.warranty_reference_id,v_order.priority,'assigned',v_order.assigned_to,v_order.start_date,v_order.start_date,(v_entry->'work_order'->>'start_time')::time,(v_entry->'work_order'->>'end_time')::time,v_order.target_completion_date,v_order.estimated_hours,v_order.notes,v_order.internal_notes,v_order.send_appointment_reminder,v_order.reminder_email,v_order.reminder_sms,v_order.customer_contacted,auth.uid(),v_order.office_id,v_order.is_recurring_parent,v_order.recurrence_rule,v_order.recurring_subscription_id,v_order.work_order_type_id,v_order.service_location_address,v_order.service_location_city,v_order.service_location_state,v_order.service_location_zip,v_order.address,p_request_id,jsonb_array_length(v_result)) RETURNING * INTO v_existing;
  v_index:=0;
  FOR v_task IN SELECT value FROM jsonb_array_elements(COALESCE(v_entry->'tasks','[]')) LOOP
   IF NULLIF(v_task->>'project_task_id','') IS NOT NULL THEN
    SELECT * INTO v_master FROM public.project_tasks WHERE id=(v_task->>'project_task_id')::uuid AND organization_id=v_org FOR UPDATE;
    IF NOT FOUND OR v_master.project_id IS DISTINCT FROM v_order.project_id OR v_master.status<>'open' THEN RAISE EXCEPTION 'Invalid project task assignment'; END IF;
   ELSE v_master:=NULL; END IF;
   INSERT INTO public.work_order_tasks(work_order_id,organization_id,assigned_to,project_task_id,title,description,estimated_hours,visit_instructions,status,sort_order)
   VALUES(v_existing.id,v_org,v_order.assigned_to,v_master.id,COALESCE(v_master.title,v_task->>'title'),CASE WHEN v_master.id IS NOT NULL THEN v_master.description ELSE v_task->>'description' END,COALESCE((v_task->>'estimated_hours')::numeric,0),v_task->>'visit_instructions','pending',v_index);
   v_index:=v_index+1;
  END LOOP;
  FOR v_part IN SELECT value FROM jsonb_array_elements(COALESCE(v_entry->'parts','[]')) LOOP
   INSERT INTO public.service_parts_used(work_order_id,organization_id,product_id,part_name,part_sku,quantity,unit_cost,unit_price,is_warranty)
   VALUES(v_existing.id,v_org,(v_part->>'product_id')::uuid,v_part->>'part_name',v_part->>'part_sku',(v_part->>'quantity')::numeric,(v_part->>'unit_cost')::numeric,(v_part->>'unit_price')::numeric,false);
  END LOOP;
  v_result:=v_result||jsonb_build_array(jsonb_build_object('id',v_existing.id,'work_order_number',v_existing.work_order_number));
 END LOOP;
 IF p_service_request_id IS NOT NULL THEN
  UPDATE public.service_requests SET status='scheduled',work_order_id=(v_result->0->>'id')::uuid,updated_at=now() WHERE id=p_service_request_id AND organization_id=v_org AND contact_id=v_order.contact_id AND work_order_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service request already scheduled or belongs to another customer'; END IF;
 END IF;
 RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.create_work_order_assignments(uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_work_order_assignments(uuid,jsonb,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_visit_task_progress(p_assignment_id uuid,p_disposition text,p_notes text DEFAULT NULL,p_complete_project boolean DEFAULT false,p_event_id uuid DEFAULT gen_random_uuid(),p_expected_version integer DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_task public.work_order_tasks; v_order public.work_orders; v_master public.project_tasks; v_profile public.profiles; v_id uuid; v_previous public.work_order_task_updates;
BEGIN
 SELECT * INTO v_profile FROM public.profiles WHERE id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Staff authentication required'; END IF;
 SELECT * INTO v_task FROM public.work_order_tasks WHERE id=p_assignment_id AND organization_id=v_profile.organization_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assignment not found'; END IF;
 SELECT * INTO v_order FROM public.work_orders WHERE id=v_task.work_order_id AND organization_id=v_profile.organization_id FOR UPDATE;
 IF NOT FOUND OR (v_order.assigned_to IS DISTINCT FROM auth.uid() AND v_profile.role NOT IN ('admin','manager','service_manager','project_manager')) THEN RAISE EXCEPTION 'Only assigned technician or authorized manager can report progress'; END IF;
 IF p_event_id IS NULL THEN RAISE EXCEPTION 'Progress retry key required'; END IF;
 SELECT * INTO v_previous FROM public.work_order_task_updates WHERE id=p_event_id;
 IF FOUND THEN
  IF v_previous.work_order_task_id IS DISTINCT FROM p_assignment_id OR v_previous.technician_id IS DISTINCT FROM auth.uid() OR v_previous.disposition IS DISTINCT FROM p_disposition OR v_previous.notes IS DISTINCT FROM NULLIF(btrim(p_notes),'') OR v_previous.completes_project_task IS DISTINCT FROM p_complete_project THEN RAISE EXCEPTION 'Progress retry key reused'; END IF;
  RETURN v_previous.id;
 END IF;
 IF p_expected_version IS NOT NULL AND p_expected_version<>v_task.progress_version THEN RAISE EXCEPTION 'Task changed on another visit. Refresh and review before saving.'; END IF;
 IF p_disposition NOT IN ('pending','in_progress','partial','blocked','completed','reopened') THEN RAISE EXCEPTION 'Invalid progress'; END IF;
 IF p_disposition IN ('partial','blocked','reopened') AND NULLIF(btrim(p_notes),'') IS NULL THEN RAISE EXCEPTION 'Describe remaining work or the blocker'; END IF;
 IF p_complete_project AND (p_disposition<>'completed' OR v_task.project_task_id IS NULL) THEN RAISE EXCEPTION 'Final completion requires a linked completed assignment'; END IF;
 IF v_task.project_task_id IS NOT NULL THEN
  SELECT * INTO v_master FROM public.project_tasks WHERE id=v_task.project_task_id AND project_id=v_order.project_id AND organization_id=v_profile.organization_id FOR UPDATE;
  IF NOT FOUND OR v_master.status='cancelled' THEN RAISE EXCEPTION 'Project task is missing or cancelled'; END IF;
 END IF;
 INSERT INTO public.work_order_task_updates(id,organization_id,work_order_id,work_order_task_id,project_task_id,technician_id,disposition,notes,completes_project_task)
 VALUES(p_event_id,v_profile.organization_id,v_order.id,v_task.id,v_master.id,auth.uid(),p_disposition,NULLIF(btrim(p_notes),''),p_complete_project) RETURNING id INTO v_id;
 UPDATE public.work_order_tasks SET progress_version=progress_version+1,status=CASE WHEN p_disposition='reopened' THEN 'pending' ELSE p_disposition END,completed_at=CASE WHEN p_disposition='completed' THEN now() ELSE NULL END,completed_by=CASE WHEN p_disposition='completed' THEN auth.uid() ELSE NULL END WHERE id=v_task.id;
 IF v_master.id IS NOT NULL THEN
  IF p_complete_project THEN
   UPDATE public.project_tasks SET status='completed',progress_status='completed',completed_at=now(),is_auto_completed=false,auto_completed_by=NULL WHERE id=v_master.id;
   INSERT INTO public.work_order_task_completions(organization_id,work_order_id,project_task_id,technician_id,notes) VALUES(v_profile.organization_id,v_order.id,v_master.id,auth.uid(),p_notes);
  ELSIF p_disposition='reopened' THEN
   UPDATE public.project_tasks SET status='open',progress_status='pending',completed_at=NULL,is_auto_completed=false,auto_completed_by=NULL WHERE id=v_master.id;
  ELSIF v_master.status='open' THEN
   UPDATE public.project_tasks SET progress_status=CASE WHEN p_disposition='completed' THEN 'partial' ELSE p_disposition END WHERE id=v_master.id;
  END IF;
 END IF;
 RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.record_visit_task_progress(uuid,text,text,boolean,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_visit_task_progress(uuid,text,text,boolean,uuid,integer) TO authenticated;

-- Capture only on a new sold handoff. Never label today's legacy scope original.
CREATE OR REPLACE FUNCTION public.capture_sold_project_handoff() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_proposal uuid;
BEGIN
 IF NEW.sales_order_id IS NULL THEN RETURN NEW; END IF;
 SELECT proposal_id INTO v_proposal FROM public.sales_orders WHERE id=NEW.sales_order_id AND organization_id=NEW.organization_id;
 IF v_proposal IS NULL THEN RAISE EXCEPTION 'Sales order proposal missing'; END IF;
 NEW.sold_handoff:=jsonb_build_object('version',1,'captured_at',now(),'proposal_id',v_proposal,'overall_scope',(SELECT scope_of_work FROM public.proposal_settings WHERE proposal_id=v_proposal AND organization_id=NEW.organization_id),'rooms',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'description',r.description,'sort_order',r.sort_order) ORDER BY r.sort_order) FROM public.proposal_rooms r WHERE r.proposal_id=v_proposal AND r.organization_id=NEW.organization_id),'[]'),'equipment',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'room_id',i.room_id,'description',i.description,'quantity',i.quantity,'unit',i.unit,'task_notes',i.task_notes,'programming_notes',i.programming_notes) ORDER BY i.sort_order) FROM public.proposal_line_items i WHERE i.proposal_id=v_proposal AND i.organization_id=NEW.organization_id AND NOT COALESCE(i.is_hidden,false)),'[]'),'tasks',COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.sort_order) FROM public.proposal_tasks t WHERE t.proposal_id=v_proposal AND t.organization_id=NEW.organization_id),'[]'));
 RETURN NEW;
END; $$;
CREATE TRIGGER capture_sold_project_handoff BEFORE INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION public.capture_sold_project_handoff();
CREATE OR REPLACE FUNCTION public.protect_sold_handoff() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.sold_handoff IS DISTINCT FROM OLD.sold_handoff THEN RAISE EXCEPTION 'Original sold handoff is immutable'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER protect_sold_handoff BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.protect_sold_handoff();

-- Field access does not require access to the Sales module or financial columns.
CREATE OR REPLACE FUNCTION public.get_work_order_project_context(p_work_order_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_order public.work_orders; v_project public.projects; v_profile public.profiles;
BEGIN
 SELECT * INTO v_profile FROM public.profiles WHERE id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Staff authentication required'; END IF;
 SELECT * INTO v_order FROM public.work_orders WHERE id=p_work_order_id AND organization_id=v_profile.organization_id;
 IF NOT FOUND OR (v_order.assigned_to IS DISTINCT FROM auth.uid() AND v_profile.role NOT IN ('admin','manager','project_manager','service_manager')) THEN RAISE EXCEPTION 'Project access denied'; END IF;
 SELECT * INTO v_project FROM public.projects WHERE id=v_order.project_id AND organization_id=v_profile.organization_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('id',v_project.id,'name',v_project.name,'sold_handoff',v_project.sold_handoff,'tasks',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'description',t.description,'estimated_hours',t.estimated_hours,'status',t.status,'progress_status',t.progress_status,'room_name',t.room_name,'covered_items',t.covered_items,'labor_phase_id',t.labor_phase_id,'phase_name',l.name) ORDER BY t.sort_order) FROM public.project_tasks t LEFT JOIN public.labor_phases l ON l.id=t.labor_phase_id WHERE t.project_id=v_project.id AND t.organization_id=v_profile.organization_id),'[]'),'history',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',u.id,'project_task_id',u.project_task_id,'work_order_id',u.work_order_id,'work_order_task_id',u.work_order_task_id,'disposition',u.disposition,'notes',u.notes,'created_at',u.created_at,'technician_name',p.full_name,'completes_project_task',u.completes_project_task,'is_legacy',u.is_legacy,'actual_hours',u.actual_hours) ORDER BY u.created_at DESC) FROM public.project_task_activity u JOIN public.project_tasks t ON t.id=u.project_task_id LEFT JOIN public.profiles p ON p.id=u.technician_id WHERE t.project_id=v_project.id AND u.organization_id=v_profile.organization_id),'[]'));
END; $$;
REVOKE ALL ON FUNCTION public.get_work_order_project_context(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_work_order_project_context(uuid) TO authenticated;

-- Labor edits seed only items never seeded; intentional deletion remains deleted.
CREATE TRIGGER seed_tasks_on_labor_update AFTER UPDATE OF labor_hours,programming_labor_hours ON public.proposal_line_items FOR EACH ROW WHEN(NEW.tasks_seeded_at IS NULL) EXECUTE FUNCTION public.seed_tasks_on_line_item_insert_trigger();

CREATE OR REPLACE FUNCTION public.require_visit_task_outcomes() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed' AND EXISTS(SELECT 1 FROM public.work_order_tasks WHERE work_order_id=NEW.id AND status IN ('pending','in_progress')) THEN
  RAISE EXCEPTION 'Record an outcome for every assigned task: complete, partial, or blocked';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER require_visit_task_outcomes BEFORE UPDATE OF status ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.require_visit_task_outcomes();

-- Extend the authoritative seeder with a row lock, notes and allocated estimates.
CREATE OR REPLACE FUNCTION public.seed_proposal_tasks_for_line_item(p_line_item_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_item public.proposal_line_items; v_default record; v_hours numeric; v_count integer; v_notes text;
BEGIN
 SELECT * INTO v_item FROM public.proposal_line_items WHERE id=p_line_item_id FOR UPDATE;
 IF NOT FOUND OR v_item.tasks_seeded_at IS NOT NULL THEN RETURN; END IF;
 IF auth.uid() IS NOT NULL AND v_item.organization_id IS DISTINCT FROM public.get_user_org_id() THEN RAISE EXCEPTION 'Item access denied'; END IF;
 SELECT COALESCE(sum(hours),0) INTO v_hours FROM public.proposal_line_item_labor_phases WHERE line_item_id=p_line_item_id;
 IF v_hours=0 THEN v_hours:=COALESCE(v_item.labor_hours,0)+COALESCE(v_item.programming_labor_hours,0); END IF;
 v_hours:=v_hours*COALESCE(v_item.quantity,1);
 SELECT string_agg(tech_notes,E'\n' ORDER BY sort_order) INTO v_notes FROM public.proposal_line_item_labor_phases WHERE line_item_id=p_line_item_id AND NULLIF(btrim(tech_notes),'') IS NOT NULL;
 v_notes:=NULLIF(concat_ws(E'\n',NULLIF(v_item.task_notes,''),NULLIF(v_item.programming_notes,''),v_notes),'');
 SELECT count(*) INTO v_count FROM public.catalog_item_default_tasks WHERE product_id=v_item.product_id AND organization_id=v_item.organization_id;
 IF v_count>0 THEN
  FOR v_default IN SELECT * FROM public.catalog_item_default_tasks WHERE product_id=v_item.product_id AND organization_id=v_item.organization_id ORDER BY sort_order LOOP
   INSERT INTO public.proposal_tasks(proposal_id,line_item_id,source_default_task_id,title,description,labor_phase_id,sort_order,organization_id,estimated_hours)
   VALUES(v_item.proposal_id,v_item.id,v_default.id,v_default.title,NULLIF(concat_ws(E'\n',v_default.description,v_notes),''),v_default.labor_phase_id,v_default.sort_order,v_item.organization_id,CASE WHEN v_hours>0 THEN v_hours/v_count ELSE NULL END);
  END LOOP;
 ELSIF v_hours>0 THEN
  INSERT INTO public.proposal_tasks(proposal_id,line_item_id,title,description,labor_phase_id,sort_order,organization_id,estimated_hours)
  VALUES(v_item.proposal_id,v_item.id,v_item.description,v_notes,v_item.labor_phase_id,0,v_item.organization_id,v_hours);
 ELSE RETURN;
 END IF;
 UPDATE public.proposal_line_items SET tasks_seeded_at=now() WHERE id=v_item.id;
END; $$;
REVOKE ALL ON FUNCTION public.seed_proposal_tasks_for_line_item(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.seed_proposal_tasks_for_line_item(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_project_tasks_on_project_creation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_proposal uuid;
BEGIN
 IF NEW.sales_order_id IS NULL THEN RETURN NEW; END IF;
 SELECT proposal_id INTO v_proposal FROM public.sales_orders WHERE id=NEW.sales_order_id AND organization_id=NEW.organization_id;
 INSERT INTO public.project_tasks(project_id,organization_id,title,description,labor_phase_id,status,sort_order,source_line_item_id,source_proposal_task_id,source,visibility,created_by,estimated_hours,room_name,covered_items)
 SELECT NEW.id,NEW.organization_id,t.title,t.description,t.labor_phase_id,'open',t.sort_order,t.line_item_id,t.id,'proposal','internal',NEW.created_by,COALESCE(t.estimated_hours,0),r.name,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',ci.id,'description',ci.description,'quantity',ci.quantity,'room_id',ci.room_id)) FROM public.proposal_line_items ci WHERE ci.proposal_id=v_proposal AND (ci.id=t.line_item_id OR ci.id=ANY(t.covered_item_ids))),'[]')
 FROM public.proposal_tasks t LEFT JOIN public.proposal_line_items i ON i.id=t.line_item_id LEFT JOIN public.proposal_rooms r ON r.id=i.room_id
 WHERE t.proposal_id=v_proposal AND t.organization_id=NEW.organization_id AND (t.line_item_id IS NULL OR NOT COALESCE(i.is_hidden,false) OR EXISTS(SELECT 1 FROM public.proposal_line_items ci WHERE ci.proposal_id=v_proposal AND ci.organization_id=NEW.organization_id AND ci.id=ANY(t.covered_item_ids) AND NOT COALESCE(ci.is_hidden,false)))
 ON CONFLICT (project_id,source_proposal_task_id) WHERE source_proposal_task_id IS NOT NULL DO NOTHING;
 RETURN NEW;
END; $$;

-- Item coverage stays within this proposal and marks covered items deliberately seeded.
CREATE OR REPLACE FUNCTION public.validate_proposal_task_coverage() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
 FOR v_id IN SELECT DISTINCT unnest(NEW.covered_item_ids || CASE WHEN NEW.line_item_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[NEW.line_item_id] END) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.proposal_line_items WHERE id=v_id AND proposal_id=NEW.proposal_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Covered item belongs to another proposal'; END IF;
  UPDATE public.proposal_line_items SET tasks_seeded_at=COALESCE(tasks_seeded_at,now()) WHERE id=v_id;
 END LOOP;
 RETURN NEW;
END; $$;
CREATE TRIGGER validate_proposal_task_coverage BEFORE INSERT OR UPDATE OF line_item_id,covered_item_ids ON public.proposal_tasks FOR EACH ROW EXECUTE FUNCTION public.validate_proposal_task_coverage();
-- Cancel outstanding assignments visibly; never erase visit history.
CREATE OR REPLACE FUNCTION public.cancel_removed_task_assignments() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status='cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
  UPDATE public.work_order_tasks SET status='cancelled' WHERE project_task_id=NEW.id AND organization_id=NEW.organization_id AND status<>'completed';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER cancel_removed_task_assignments AFTER UPDATE OF status ON public.project_tasks FOR EACH ROW EXECUTE FUNCTION public.cancel_removed_task_assignments();

-- Existing approval functions retain their billing/notification logic. Project
-- failures must abort conversion rather than merely warn and commit an empty handoff.
DO $$
DECLARE v_name text; v_oid oid; v_definition text;
BEGIN
 FOREACH v_name IN ARRAY ARRAY['handle_unified_proposal_approval','complete_po_pending_approval'] LOOP
  v_oid:=to_regprocedure('public.'||v_name||'()');
  IF v_oid IS NOT NULL THEN
   v_definition:=pg_get_functiondef(v_oid);
   v_definition:=replace(v_definition,'RAISE WARNING ''Failed to create project','RAISE EXCEPTION ''Failed to create project');
   EXECUTE v_definition;
  END IF;
 END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.finalize_work_order_visit(p_work_order_id uuid,p_completion jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_order public.work_orders; v_completion_id uuid;
BEGIN
 SELECT * INTO v_order FROM public.work_orders WHERE id=p_work_order_id AND organization_id=public.get_user_org_id() FOR UPDATE;
 IF NOT FOUND OR v_order.assigned_to IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Only assigned technician can close this visit'; END IF;
 SELECT id INTO v_completion_id FROM public.job_completions WHERE work_order_id=v_order.id AND technician_id=auth.uid() LIMIT 1;
 IF v_order.status='completed' AND v_completion_id IS NOT NULL THEN RETURN v_completion_id; END IF;
 -- The outcome trigger rejects unfinished/unreported tasks. The completion
 -- record and visit status commit together or both roll back.
 UPDATE public.work_orders SET status='completed',actual_completion_date=current_date WHERE id=v_order.id;
 INSERT INTO public.job_completions(work_order_id,organization_id,technician_id,template_id,checklist_data,tech_notes,customer_signature_url,customer_name,customer_email,quality_score,flagged_for_review)
 VALUES(v_order.id,v_order.organization_id,auth.uid(),(p_completion->>'template_id')::uuid,p_completion->'checklist_data',p_completion->>'tech_notes',p_completion->>'customer_signature_url',p_completion->>'customer_name',p_completion->>'customer_email',(p_completion->>'quality_score')::integer,COALESCE((p_completion->>'flagged_for_review')::boolean,false)) RETURNING id INTO v_completion_id;
 RETURN v_completion_id;
END; $$;
REVOKE ALL ON FUNCTION public.finalize_work_order_visit(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finalize_work_order_visit(uuid,jsonb) TO authenticated;

-- Preserve earlier completion notes beside the new visit progress events.
CREATE VIEW public.project_task_activity WITH(security_invoker=true) AS
 SELECT u.id,u.organization_id,u.work_order_id,u.work_order_task_id,u.project_task_id,u.technician_id,u.disposition,u.notes,u.created_at,u.completes_project_task,p.full_name AS technician_name,false AS is_legacy,NULL::numeric AS actual_hours
 FROM public.work_order_task_updates u LEFT JOIN public.profiles p ON p.id=u.technician_id
 UNION ALL
 SELECT c.id,c.organization_id,c.work_order_id,c.work_order_task_id,COALESCE(c.project_task_id,t.project_task_id),c.technician_id,'completed',c.notes,COALESCE(c.completed_at,c.created_at),false,p.full_name,true,c.actual_hours
 FROM public.work_order_task_completions c LEFT JOIN public.work_order_tasks t ON t.id=c.work_order_task_id LEFT JOIN public.profiles p ON p.id=c.technician_id
 WHERE NOT EXISTS(SELECT 1 FROM public.work_order_task_updates u WHERE u.organization_id=c.organization_id AND u.work_order_id=c.work_order_id AND u.project_task_id=COALESCE(c.project_task_id,t.project_task_id) AND u.technician_id=c.technician_id AND u.completes_project_task AND u.created_at=c.completed_at);
GRANT SELECT ON public.project_task_activity TO authenticated;
REVOKE ALL ON public.project_task_activity FROM anon;
