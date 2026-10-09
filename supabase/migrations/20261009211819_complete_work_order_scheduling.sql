-- New work orders are complete bookings. Existing history is never deleted/backfilled.
-- Requires the project-task handoff migration; fail clearly on an out-of-date deployment.
DO $$ BEGIN
 IF to_regprocedure('public.create_work_order_assignments(uuid,jsonb,uuid)') IS NULL THEN
  RAISE EXCEPTION 'Apply project_task_visit_handoff and subsequent migrations before complete_work_order_scheduling';
 END IF;
END $$;
-- A split may schedule the same technician in multiple non-overlapping parts.
DROP INDEX public.work_order_creation_retry;
CREATE UNIQUE INDEX work_order_creation_retry ON public.work_orders(organization_id,creation_request_id,creation_sequence) WHERE creation_request_id IS NOT NULL;
CREATE SCHEMA IF NOT EXISTS work_order_private;
REVOKE ALL ON SCHEMA work_order_private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION work_order_private.assert_booking(
 p_org uuid, p_tech uuid, p_date date, p_start time, p_end time,
 p_exclude_work_order uuid DEFAULT NULL, p_exclude_appointment uuid DEFAULT NULL, p_require_technician boolean DEFAULT true
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE allow_overlap boolean;
BEGIN
 IF auth.uid() IS NULL OR p_org IS DISTINCT FROM (SELECT organization_id FROM public.profiles WHERE id=auth.uid() AND is_active) THEN
  RAISE EXCEPTION 'A booking must belong to your organization';
 END IF;
 IF p_date IS NULL OR p_start IS NULL OR p_end IS NULL OR p_end <= p_start OR p_end>='24:00'::time THEN
  RAISE EXCEPTION 'Select a date, start time and later end time before creating a work order';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_tech AND organization_id=p_org AND is_active AND (NOT p_require_technician OR is_technician)) THEN
  RAISE EXCEPTION 'Select an active technician in your organization';
 END IF;
 -- Shared by work-order and appointment writes. Serializes bookings per technician.
 PERFORM pg_advisory_xact_lock(hashtextextended('booking:'||p_org::text||':'||p_tech::text,0));
 IF EXISTS(SELECT 1 FROM public.pto_requests WHERE organization_id=p_org AND employee_id=p_tech AND status='approved' AND p_date BETWEEN start_date AND end_date) THEN
  RAISE EXCEPTION 'Technician is on approved time off';
 END IF;
 allow_overlap := coalesce(current_setting('app.allow_booking_overlap',true),'false')='true'
  AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND organization_id=p_org AND role IN ('admin','manager','service_manager'));
 IF NOT allow_overlap AND (
  EXISTS(SELECT 1 FROM public.work_orders w WHERE w.organization_id=p_org AND w.assigned_to=p_tech
   AND w.scheduled_date=p_date AND w.id IS DISTINCT FROM p_exclude_work_order
   AND w.status NOT IN ('completed','cancelled','archived','split') AND NOT coalesce(w.is_archived,false)
   AND coalesce(w.scheduled_start_time,'00:00'::time)<p_end AND coalesce(w.scheduled_end_time,'23:59:59'::time)>p_start)
  OR EXISTS(SELECT 1 FROM public.appointments a WHERE a.organization_id=p_org AND a.assigned_technician=p_tech
   AND a.appointment_date::date=p_date AND a.id IS DISTINCT FROM p_exclude_appointment
   AND coalesce(a.status,'scheduled') NOT IN ('completed','cancelled','archived')
   AND (a.all_day OR (coalesce(nullif(a.start_time::text,''),'00:00')::time<p_end
   AND coalesce(nullif(a.end_time::text,''),'23:59:59')::time>p_start)))
 ) THEN RAISE EXCEPTION 'Technician is already booked during this time'; END IF;
END $$;
REVOKE ALL ON FUNCTION work_order_private.assert_booking(uuid,uuid,date,time,time,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION work_order_private.require_complete_work_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE scheduling_changed boolean;
BEGIN
 scheduling_changed := TG_OP='INSERT';
 IF TG_OP='UPDATE' THEN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN RAISE EXCEPTION 'Cannot move a work order between organizations'; END IF;
  scheduling_changed := (NEW.assigned_to,NEW.scheduled_date,NEW.scheduled_start_time,NEW.scheduled_end_time,NEW.start_date)
    IS DISTINCT FROM (OLD.assigned_to,OLD.scheduled_date,OLD.scheduled_start_time,OLD.scheduled_end_time,OLD.start_date)
    OR (OLD.status IN ('completed','cancelled','archived','split') AND NEW.status NOT IN ('completed','cancelled','archived','split'))
    OR (coalesce(OLD.is_archived,false) AND NOT coalesce(NEW.is_archived,false));
 END IF;
 -- Legacy incomplete records can still receive notes, progress and close-out updates.
 IF TG_OP='UPDATE' AND (NEW.title,NEW.contact_id) IS DISTINCT FROM (OLD.title,OLD.contact_id) THEN
  IF nullif(btrim(NEW.title),'') IS NULL OR NOT EXISTS(SELECT 1 FROM public.contacts WHERE id=NEW.contact_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'A work order requires a title and customer in your organization'; END IF;
 END IF;
 IF NOT scheduling_changed THEN RETURN NEW; END IF;
 IF nullif(btrim(NEW.title),'') IS NULL OR NOT EXISTS(SELECT 1 FROM public.contacts WHERE id=NEW.contact_id AND organization_id=NEW.organization_id) THEN
  RAISE EXCEPTION 'A work order requires a title and customer';
 END IF;
 IF NEW.scheduled_date IS NULL OR NEW.scheduled_start_time IS NULL OR NEW.scheduled_end_time IS NULL OR NEW.scheduled_end_time<=NEW.scheduled_start_time OR NEW.scheduled_end_time>='24:00'::time THEN
  RAISE EXCEPTION 'Finish scheduling this work order; keep unscheduled work as a service request';
 END IF;
 IF TG_OP='UPDATE' AND NEW.start_date IS DISTINCT FROM OLD.start_date AND NEW.scheduled_date IS NOT DISTINCT FROM OLD.scheduled_date AND NEW.start_date IS DISTINCT FROM NEW.scheduled_date THEN
  RAISE EXCEPTION 'Change the booking date through scheduling';
 END IF;
 NEW.start_date := NEW.scheduled_date;
 PERFORM work_order_private.assert_booking(NEW.organization_id,NEW.assigned_to,NEW.scheduled_date,NEW.scheduled_start_time,NEW.scheduled_end_time,NEW.id,NEW.appointment_id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION work_order_private.require_complete_work_order() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS zz_require_complete_work_order ON public.work_orders;
CREATE TRIGGER zz_require_complete_work_order BEFORE INSERT OR UPDATE ON public.work_orders
 FOR EACH ROW EXECUTE FUNCTION work_order_private.require_complete_work_order();

CREATE OR REPLACE FUNCTION work_order_private.guard_appointment_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NEW.assigned_technician IS NULL OR coalesce(NEW.status,'scheduled') IN ('cancelled','completed','archived') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.assigned_technician,NEW.appointment_date,NEW.start_time,NEW.end_time,NEW.status,NEW.all_day)
   IS NOT DISTINCT FROM (OLD.assigned_technician,OLD.appointment_date,OLD.start_time,OLD.end_time,OLD.status,OLD.all_day) THEN RETURN NEW; END IF;
 END IF;
 PERFORM work_order_private.assert_booking(NEW.organization_id,NEW.assigned_technician,NEW.appointment_date::date,
  CASE WHEN NEW.all_day THEN '00:00'::time ELSE coalesce(nullif(NEW.start_time::text,''),'00:00')::time END,CASE WHEN NEW.all_day THEN '23:59:59'::time ELSE coalesce(nullif(NEW.end_time::text,''),'23:59:59')::time END,NULL,NEW.id,false);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION work_order_private.guard_appointment_booking() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS zz_guard_appointment_booking ON public.appointments;
CREATE TRIGGER zz_guard_appointment_booking BEFORE INSERT OR UPDATE ON public.appointments
 FOR EACH ROW EXECUTE FUNCTION work_order_private.guard_appointment_booking();

-- These older triggers convert intake prematurely or duplicate VIP bookings.
DROP TRIGGER IF EXISTS auto_convert_service_request_to_work_order ON public.service_requests;
DROP TRIGGER IF EXISTS on_vip_appointment_create_work_order ON public.appointments;
DROP TRIGGER IF EXISTS on_vip_appointment_update_work_order ON public.appointments;
DROP TRIGGER IF EXISTS on_vip_appointment_sync_to_work_order ON public.appointments;
DROP TRIGGER IF EXISTS trg_create_vip_work_order ON public.appointments;

CREATE OR REPLACE FUNCTION public.create_work_order_assignments(p_request_id uuid,p_assignments jsonb,p_service_request_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_request public.service_requests; v_org uuid:=public.get_user_org_id(); v_entry jsonb; v_task jsonb; v_part jsonb; v_order public.work_orders; v_existing public.work_orders; v_master public.project_tasks; v_result jsonb:='[]'; v_index integer;
BEGIN
 IF auth.uid() IS NULL OR v_org IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Authentication and retry key required'; END IF;
 IF jsonb_typeof(p_assignments) IS DISTINCT FROM 'array' OR jsonb_array_length(p_assignments)=0 THEN RAISE EXCEPTION 'Assignments required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text||p_request_id::text,0));
 -- A replay returns the original result; it never adds technicians or tasks.
 IF EXISTS(SELECT 1 FROM public.work_orders WHERE organization_id=v_org AND creation_request_id=p_request_id) THEN
  SELECT jsonb_agg(jsonb_build_object('id',id,'work_order_number',work_order_number) ORDER BY creation_sequence) INTO v_result FROM public.work_orders WHERE organization_id=v_org AND creation_request_id=p_request_id;
  RETURN v_result;
 END IF;
 IF p_service_request_id IS NOT NULL THEN
  SELECT * INTO v_request FROM public.service_requests WHERE id=p_service_request_id AND organization_id=v_org AND work_order_id IS NULL AND status NOT IN ('cancelled','closed','completed') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service request is missing, closed or already scheduled'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_assignments) item WHERE (v_request.contact_id IS NOT NULL AND (item->'work_order'->>'contact_id')::uuid IS DISTINCT FROM v_request.contact_id)
    OR (item->'work_order'->>'contact_id')::uuid IS DISTINCT FROM (p_assignments->0->'work_order'->>'contact_id')::uuid
    OR (v_request.request_type='project' AND (item->'work_order'->>'project_id')::uuid IS DISTINCT FROM v_request.project_id)
    OR (item->'work_order'->>'start_date')::date<nullif(to_jsonb(v_request)->>'earliest_date','')::date) THEN RAISE EXCEPTION 'Keep the request customer/project and schedule on or after its earliest date'; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('booking:'||v_org::text||':'||tech,0)) FROM (SELECT DISTINCT value->'work_order'->>'assigned_to' AS tech FROM jsonb_array_elements(p_assignments) ORDER BY tech) locks;
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
  IF v_existing.is_recurring_parent AND v_existing.recurrence_rule IS NOT NULL THEN PERFORM public.generate_recurring_work_orders(v_existing.id); END IF;
  v_result:=v_result||jsonb_build_array(jsonb_build_object('id',v_existing.id,'work_order_number',v_existing.work_order_number));
 END LOOP;
 IF p_service_request_id IS NOT NULL THEN
  UPDATE public.service_requests SET contact_id=coalesce(contact_id,v_order.contact_id),status='scheduled',work_order_id=(v_result->0->>'id')::uuid,updated_at=now() WHERE id=p_service_request_id AND organization_id=v_org AND (contact_id IS NULL OR contact_id=v_order.contact_id) AND work_order_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service request already scheduled or belongs to another customer'; END IF;
 END IF;
 RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.create_work_order_assignments(uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_work_order_assignments(uuid,jsonb,uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.reschedule_work_order_secure(p_work_order_id uuid,p_new_date text,p_new_start_time text,p_new_end_time text,p_new_tech_id text DEFAULT NULL,p_force boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE wo public.work_orders; old_override text:=current_setting('app.allow_booking_overlap',true);
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND role IN ('admin','manager','service_manager')) THEN RAISE EXCEPTION 'Permission denied for scheduling'; END IF;
 SELECT * INTO wo FROM public.work_orders WHERE id=p_work_order_id AND organization_id=public.get_user_org_id() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Work order not found'; END IF;
 IF wo.status IN ('completed','cancelled','archived','split') OR wo.is_archived THEN RAISE EXCEPTION 'Closed work orders cannot be rescheduled'; END IF;
 IF p_new_tech_id='' THEN RAISE EXCEPTION 'Work orders must retain a technician; use a service request for unscheduled work'; END IF;
 PERFORM set_config('app.allow_booking_overlap',p_force::text,true);
 UPDATE public.work_orders SET scheduled_date=p_new_date::date,scheduled_start_time=p_new_start_time::time,scheduled_end_time=p_new_end_time::time,
  assigned_to=coalesce(p_new_tech_id::uuid,wo.assigned_to),start_date=p_new_date::date,
  status=CASE WHEN wo.status IN ('pending','scheduled','unscheduled') THEN 'assigned' ELSE wo.status END WHERE id=wo.id;
 PERFORM set_config('app.allow_booking_overlap',coalesce(old_override,'false'),true);
 RETURN jsonb_build_object('success',true,'new_status',CASE WHEN wo.status IN ('pending','scheduled','unscheduled') THEN 'assigned' ELSE wo.status END);
EXCEPTION WHEN OTHERS THEN
 IF SQLERRM LIKE '%already booked%' THEN RETURN jsonb_build_object('success',false,'conflict',jsonb_build_object('hasConflict',true)); END IF;
 RETURN jsonb_build_object('success',false,'error',SQLERRM);
END $$;
REVOKE ALL ON FUNCTION public.reschedule_work_order_secure(uuid,text,text,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reschedule_work_order_secure(uuid,text,text,text,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.reschedule_appointment_secure(p_appointment_id uuid,p_new_date text,p_new_start_time text,p_new_end_time text,p_new_tech_id text DEFAULT NULL,p_force boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE old_override text:=current_setting('app.allow_booking_overlap',true);
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND role IN ('admin','manager','service_manager')) THEN RAISE EXCEPTION 'Permission denied for scheduling'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.appointments WHERE id=p_appointment_id AND organization_id=public.get_user_org_id()) THEN RAISE EXCEPTION 'Appointment not found'; END IF;
 IF p_new_start_time::time>=p_new_end_time::time THEN RAISE EXCEPTION 'End time must be after start time'; END IF;
 PERFORM set_config('app.allow_booking_overlap',p_force::text,true);
 UPDATE public.appointments SET appointment_date=p_new_date::date,start_time=p_new_start_time::time,end_time=p_new_end_time::time,
  assigned_technician=CASE WHEN p_new_tech_id='' THEN NULL ELSE coalesce(p_new_tech_id::uuid,assigned_technician) END
 WHERE id=p_appointment_id AND organization_id=public.get_user_org_id();
 PERFORM set_config('app.allow_booking_overlap',coalesce(old_override,'false'),true);
 RETURN jsonb_build_object('success',true);
EXCEPTION WHEN OTHERS THEN
 IF SQLERRM LIKE '%already booked%' THEN RETURN jsonb_build_object('success',false,'conflict',jsonb_build_object('hasConflict',true)); END IF;
 RETURN jsonb_build_object('success',false,'error',SQLERRM);
END $$;
REVOKE ALL ON FUNCTION public.reschedule_appointment_secure(uuid,text,text,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment_secure(uuid,text,text,text,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_combined_work_orders(p_request_id uuid,p_service_request_ids uuid[],p_tech_ids uuid[],p_date date,p_start time,p_end time,p_estimated_hours numeric,p_description text,p_internal_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE sr public.service_requests; v_org uuid:=public.get_user_org_id(); result jsonb; orders jsonb; group_id uuid:=gen_random_uuid();
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL OR v_org IS NULL THEN RAISE EXCEPTION 'Authentication and retry key required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text||p_request_id::text,0));
 SELECT jsonb_agg(jsonb_build_object('id',id,'work_order_number',work_order_number) ORDER BY creation_sequence) INTO result FROM public.work_orders WHERE organization_id=v_org AND creation_request_id=p_request_id;
 IF result IS NOT NULL THEN RETURN result; END IF;
 IF coalesce(cardinality(p_service_request_ids),0)=0 OR coalesce(cardinality(p_tech_ids),0)=0 OR nullif(btrim(p_description),'') IS NULL OR coalesce(p_estimated_hours,0)<=0 THEN RAISE EXCEPTION 'Select requests, technicians, description and positive estimated hours'; END IF;
 PERFORM id FROM public.service_requests WHERE id=ANY(p_service_request_ids) AND organization_id=v_org ORDER BY id FOR UPDATE;
 IF (SELECT count(*) FROM public.service_requests WHERE id=ANY(p_service_request_ids) AND organization_id=v_org AND work_order_id IS NULL AND status NOT IN ('cancelled','closed','completed')) <> cardinality(p_service_request_ids) THEN RAISE EXCEPTION 'Requests are missing, closed or already scheduled'; END IF;
 SELECT * INTO sr FROM public.service_requests WHERE id=p_service_request_ids[1] AND organization_id=v_org;
 IF sr.contact_id IS NULL OR EXISTS(SELECT 1 FROM public.service_requests WHERE id=ANY(p_service_request_ids) AND (contact_id IS DISTINCT FROM sr.contact_id OR project_id IS DISTINCT FROM sr.project_id OR billable_type IS DISTINCT FROM sr.billable_type OR customer_location_id IS DISTINCT FROM sr.customer_location_id OR lower(btrim(coalesce(job_location_address,'')))<>lower(btrim(coalesce(sr.job_location_address,''))) OR lower(btrim(coalesce(job_location_city,'')))<>lower(btrim(coalesce(sr.job_location_city,''))) OR lower(btrim(coalesce(job_location_state,'')))<>lower(btrim(coalesce(sr.job_location_state,''))) OR lower(btrim(coalesce(job_location_zip,'')))<>lower(btrim(coalesce(sr.job_location_zip,''))))) THEN RAISE EXCEPTION 'Combine requests for the same customer, project, billing type and location'; END IF;
 IF EXISTS(SELECT 1 FROM public.service_requests r WHERE id=ANY(p_service_request_ids) AND nullif(to_jsonb(r)->>'earliest_date','')::date>p_date) THEN RAISE EXCEPTION 'Booking is before a request’s earliest date'; END IF;
 SELECT jsonb_agg(jsonb_build_object('work_order',jsonb_build_object('company_id',v_org,'assigned_to',tech,'contact_id',sr.contact_id,'customer_location_id',sr.customer_location_id,'project_id',sr.project_id,'type',CASE WHEN sr.project_id IS NULL THEN 'service' ELSE 'project' END,'title','Service: '||left(p_description,60),'description',p_description,'priority',CASE WHEN sr.priority='emergency' THEN 'urgent' WHEN sr.priority='urgent' THEN 'high' ELSE 'medium' END,'start_date',p_date,'start_time',p_start,'end_time',p_end,'estimated_hours',p_estimated_hours,'internal_notes',p_internal_notes,'customer_contacted',true,'billable_type',sr.billable_type,'is_billable',sr.billable_type='billable','work_order_group_id',group_id,'service_location_address',sr.job_location_address,'service_location_city',sr.job_location_city,'service_location_state',sr.job_location_state,'service_location_zip',sr.job_location_zip,'address',sr.job_location_address))) INTO orders FROM (SELECT DISTINCT unnest(p_tech_ids) tech ORDER BY tech) ids;
 result:=public.create_work_order_assignments(p_request_id,orders,NULL);
 UPDATE public.service_requests SET status='scheduled',work_order_id=(result->0->>'id')::uuid,updated_at=now() WHERE id=ANY(p_service_request_ids) AND organization_id=v_org;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.create_combined_work_orders(uuid,uuid[],uuid[],date,time,time,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_combined_work_orders(uuid,uuid[],uuid[],date,time,time,numeric,text,text) TO authenticated;

-- Older clients must not fall back to creating date-only work orders.
REVOKE EXECUTE ON FUNCTION public.combine_service_requests_to_work_order(uuid[],uuid[],date,text,numeric,text,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.duplicate_work_order_to_technician(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_work_order(uuid[],uuid,uuid,text,text,text,text,text,uuid[],timestamptz,numeric,text,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_work_order(uuid[],text,uuid[],date,time,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.create_scheduled_work_order_copy(p_source_id uuid,p_request_id uuid,p_tech_id uuid,p_date date,p_start time,p_end time)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE source public.work_orders; group_id uuid; result jsonb; tasks jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Authentication and retry key required'; END IF;
 SELECT * INTO source FROM public.work_orders WHERE id=p_source_id AND organization_id=public.get_user_org_id() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Source work order not found'; END IF;
 SELECT jsonb_agg(jsonb_build_object('project_task_id',t.project_task_id,'title',t.title,'description',t.description,'estimated_hours',t.estimated_hours,'visit_instructions',t.visit_instructions) ORDER BY t.sort_order)
 INTO tasks FROM public.work_order_tasks t LEFT JOIN public.project_tasks pt ON pt.id=t.project_task_id
 WHERE t.work_order_id=source.id AND t.status<>'completed' AND (t.project_task_id IS NULL OR pt.status='open');
 group_id:=coalesce(source.work_order_group_id,gen_random_uuid());
 result:=public.create_work_order_assignments(p_request_id,jsonb_build_array(jsonb_build_object('work_order',to_jsonb(source)||jsonb_build_object('company_id',source.organization_id,'assigned_to',p_tech_id,'start_date',p_date,'start_time',p_start,'end_time',p_end,'work_order_group_id',group_id,'is_recurring_parent',false,'recurrence_rule',NULL),'tasks',coalesce(tasks,'[]'))),NULL);
 UPDATE public.work_orders SET work_order_group_id=group_id WHERE id=source.id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.create_scheduled_work_order_copy(uuid,uuid,uuid,date,time,time) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_scheduled_work_order_copy(uuid,uuid,uuid,date,time,time) TO authenticated;

CREATE OR REPLACE FUNCTION public.split_scheduled_work_order(p_source_id uuid,p_request_id uuid,p_split_type text,p_reason text,p_parts jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE source public.work_orders; split_id uuid; result jsonb; orders jsonb; part jsonb; pos integer:=0;
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Authentication and retry key required'; END IF;
 SELECT * INTO source FROM public.work_orders WHERE id=p_source_id AND organization_id=public.get_user_org_id() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Source work order not found'; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',id,'work_order_number',work_order_number) ORDER BY creation_sequence) INTO result FROM public.work_orders WHERE organization_id=source.organization_id AND creation_request_id=p_request_id;
 IF result IS NOT NULL THEN RETURN result; END IF;
 IF source.status IN ('completed','cancelled','archived','split') OR source.is_archived OR EXISTS(SELECT 1 FROM public.job_splits WHERE parent_work_order_id=source.id) THEN RAISE EXCEPTION 'This work order cannot be split again'; END IF;
 IF jsonb_typeof(p_parts) IS DISTINCT FROM 'array' OR jsonb_array_length(p_parts)<2 OR jsonb_array_length(p_parts)>50 THEN RAISE EXCEPTION 'A split needs 2–50 fully scheduled parts'; END IF;
 INSERT INTO public.job_splits(parent_work_order_id,split_type,split_reason,total_parts,created_by) VALUES(source.id,p_split_type,p_reason,jsonb_array_length(p_parts),auth.uid()) RETURNING id INTO split_id;
 orders:='[]';
 FOR part IN SELECT value FROM jsonb_array_elements(p_parts) LOOP
  pos:=pos+1;
  IF nullif(btrim(part->>'description'),'') IS NULL OR coalesce((part->>'estimated_hours')::numeric,0)<=0 THEN RAISE EXCEPTION 'Every split part needs a description and positive estimated hours'; END IF;
  orders:=orders||jsonb_build_array(jsonb_build_object('work_order',to_jsonb(source)||jsonb_build_object('company_id',source.organization_id,'title',source.title||' (Part '||pos||'/'||jsonb_array_length(p_parts)||')','description',part->>'description','assigned_to',part->>'assigned_to','start_date',part->>'date','start_time',part->>'start','end_time',part->>'end','estimated_hours',part->>'estimated_hours','work_order_group_id',split_id,'is_recurring_parent',false,'recurrence_rule',NULL)));
 END LOOP;
 -- Cancel the original booking inside this transaction, freeing its slot for children.
 -- Notes, tasks, time, parts, photos and billing history remain on the original.
 UPDATE public.work_orders SET status='cancelled',notes=concat_ws(E'\n',notes,'Split into '||jsonb_array_length(p_parts)||' scheduled parts. '||coalesce(p_reason,'')) WHERE id=source.id;
 result:=public.create_work_order_assignments(p_request_id,orders,NULL);
 pos:=0;
 FOR part IN SELECT value FROM jsonb_array_elements(p_parts) LOOP
  UPDATE public.work_orders SET is_split_part=true,parent_split_id=split_id WHERE id=(result->pos->>'id')::uuid;
  INSERT INTO public.job_split_parts(job_split_id,work_order_id,part_number,assigned_to,scheduled_date,description,estimated_hours,status)
  VALUES(split_id,(result->pos->>'id')::uuid,pos+1,(part->>'assigned_to')::uuid,(part->>'date')::date,part->>'description',(part->>'estimated_hours')::numeric,'assigned');
  pos:=pos+1;
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.split_scheduled_work_order(uuid,uuid,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.split_scheduled_work_order(uuid,uuid,text,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_recurring_work_orders(parent_work_order_id uuid,generate_until date DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE parent public.work_orders; rule jsonb; horizon date; cursor_date date; step integer; freq text; generated integer:=0; occurrence integer:=0; max_count integer; due boolean; child jsonb; tasks jsonb;
BEGIN
 SELECT * INTO parent FROM public.work_orders WHERE id=parent_work_order_id AND organization_id=public.get_user_org_id() AND is_recurring_parent FOR UPDATE;
 IF auth.uid() IS NULL OR NOT FOUND THEN RAISE EXCEPTION 'Recurring parent not found in your organization'; END IF;
 IF parent.scheduled_date IS NULL OR parent.scheduled_start_time IS NULL OR parent.scheduled_end_time IS NULL THEN RAISE EXCEPTION 'Schedule the recurring parent first'; END IF;
 rule:=parent.recurrence_rule; freq:=rule->>'frequency'; step:=coalesce((rule->>'interval')::integer,1); max_count:=(rule->>'occurrences')::integer;
 IF freq NOT IN ('daily','weekly','monthly','yearly') OR freq IS NULL OR step<1 OR step>365 OR max_count<1 OR max_count>500 THEN RAISE EXCEPTION 'Invalid recurrence rule'; END IF;
 IF (rule->>'day_of_month')::integer NOT BETWEEN 1 AND 31 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(rule->'days_of_week','[]')) d WHERE d::integer NOT BETWEEN 0 AND 6) THEN RAISE EXCEPTION 'Invalid recurrence day'; END IF;
 horizon:=coalesce((rule->>'end_date')::date,generate_until,(parent.scheduled_date+interval '1 year')::date);
 IF horizon>parent.scheduled_date+interval '5 years' THEN RAISE EXCEPTION 'Recurring bookings may extend at most five years'; END IF;
 SELECT jsonb_agg(jsonb_build_object('project_task_id',t.project_task_id,'title',t.title,'description',t.description,'estimated_hours',t.estimated_hours,'visit_instructions',t.visit_instructions) ORDER BY t.sort_order) INTO tasks
 FROM public.work_order_tasks t LEFT JOIN public.project_tasks pt ON pt.id=t.project_task_id WHERE t.work_order_id=parent.id AND t.status<>'completed' AND (t.project_task_id IS NULL OR pt.status='open');
 cursor_date:=parent.scheduled_date+1;
 WHILE cursor_date<=horizon AND (max_count IS NULL OR occurrence<max_count) LOOP
  due:=CASE freq
   WHEN 'daily' THEN (cursor_date-parent.scheduled_date)%step=0
   WHEN 'weekly' THEN ((date_trunc('week',cursor_date)::date-date_trunc('week',parent.scheduled_date)::date)/7)%step=0
    AND CASE WHEN jsonb_array_length(coalesce(rule->'days_of_week','[]'))>0 THEN EXISTS(SELECT 1 FROM jsonb_array_elements_text(rule->'days_of_week') d WHERE d::integer=extract(dow FROM cursor_date)::integer) ELSE extract(dow FROM cursor_date)=extract(dow FROM parent.scheduled_date) END
   WHEN 'monthly' THEN ((extract(year FROM cursor_date)::int-extract(year FROM parent.scheduled_date)::int)*12+extract(month FROM cursor_date)::int-extract(month FROM parent.scheduled_date)::int)%step=0
    AND extract(day FROM cursor_date)=least(coalesce((rule->>'day_of_month')::int,extract(day FROM parent.scheduled_date)::int),extract(day FROM date_trunc('month',cursor_date)+interval '1 month - 1 day')::int)
   WHEN 'yearly' THEN (extract(year FROM cursor_date)::int-extract(year FROM parent.scheduled_date)::int)%step=0 AND extract(month FROM cursor_date)=extract(month FROM parent.scheduled_date)
    AND extract(day FROM cursor_date)=least(extract(day FROM parent.scheduled_date)::int,extract(day FROM date_trunc('month',cursor_date)+interval '1 month - 1 day')::int)
  END;
  IF due THEN
   occurrence:=occurrence+1;
   IF occurrence>500 THEN RAISE EXCEPTION 'Limit recurring bookings to 500 occurrences'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.work_orders WHERE recurrence_parent_id=parent.id AND scheduled_date=cursor_date) THEN
    child:=public.create_work_order_assignments(gen_random_uuid(),jsonb_build_array(jsonb_build_object('work_order',to_jsonb(parent)||jsonb_build_object('company_id',parent.organization_id,'start_date',cursor_date,'start_time',parent.scheduled_start_time,'end_time',parent.scheduled_end_time,'is_recurring_parent',false,'recurrence_rule',NULL),'tasks',coalesce(tasks,'[]'))),NULL);
    UPDATE public.work_orders SET recurrence_parent_id=parent.id WHERE id=(child->0->>'id')::uuid;
    generated:=generated+1;
   END IF;
  END IF;
  cursor_date:=cursor_date+1;
 END LOOP;
 RETURN generated;
END $$;
REVOKE ALL ON FUNCTION public.generate_recurring_work_orders(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.generate_recurring_work_orders(uuid,date) TO authenticated;
DROP TRIGGER IF EXISTS on_recurring_work_order_created ON public.work_orders;
CREATE OR REPLACE FUNCTION public.update_recurring_work_order_instances()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 UPDATE public.work_orders SET title=NEW.title,description=NEW.description,scheduled_start_time=NEW.scheduled_start_time,scheduled_end_time=NEW.scheduled_end_time,
  assigned_to=NEW.assigned_to,priority=NEW.priority,estimated_hours=NEW.estimated_hours,notes=NEW.notes,internal_notes=NEW.internal_notes
 WHERE recurrence_parent_id=NEW.id AND organization_id=NEW.organization_id AND scheduled_date>=CURRENT_DATE AND scheduled_start_time IS NOT NULL AND scheduled_end_time IS NOT NULL
  AND NEW.scheduled_start_time IS NOT NULL AND NEW.scheduled_end_time IS NOT NULL
  AND status IN ('pending','assigned','scheduled') AND NOT is_archived;
 RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_recurring_work_order_parent_updated ON public.work_orders;
CREATE TRIGGER on_recurring_work_order_parent_updated AFTER UPDATE ON public.work_orders FOR EACH ROW WHEN (NEW.is_recurring_parent) EXECUTE FUNCTION public.update_recurring_work_order_instances();

CREATE OR REPLACE FUNCTION public.get_work_orders_needing_attention(p_offset integer DEFAULT 0,p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb; v_org uuid:=public.get_user_org_id(); zone text;
BEGIN
 IF auth.uid() IS NULL OR v_org IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active) THEN RAISE EXCEPTION 'Dispatch permission required'; END IF;
 SELECT timezone INTO zone FROM public.organizations WHERE id=v_org;
 WITH flagged AS (
  SELECT w.id,w.work_order_number,w.title,w.status,w.assigned_to,w.scheduled_date,w.scheduled_start_time,w.scheduled_end_time,w.contact_id,
   coalesce(c.full_name,c.company_name,'Customer') AS customer_name,p.full_name AS technician_name,
   CASE WHEN w.assigned_to IS NULL OR NOT coalesce(p.is_active AND p.is_technician,false) OR w.contact_id IS NULL OR nullif(btrim(w.title),'') IS NULL OR w.scheduled_date IS NULL OR w.scheduled_start_time IS NULL OR w.scheduled_end_time IS NULL OR w.scheduled_end_time<=w.scheduled_start_time THEN 'incomplete' ELSE 'overdue' END AS reason
  FROM public.work_orders w LEFT JOIN public.contacts c ON c.id=w.contact_id LEFT JOIN public.profiles p ON p.id=w.assigned_to
  WHERE w.organization_id=v_org AND NOT coalesce(w.is_archived,false) AND w.status NOT IN ('completed','cancelled','archived','split')
   AND (w.assigned_to IS NULL OR NOT coalesce(p.is_active AND p.is_technician,false) OR w.contact_id IS NULL OR nullif(btrim(w.title),'') IS NULL OR w.scheduled_date IS NULL OR w.scheduled_start_time IS NULL OR w.scheduled_end_time IS NULL OR w.scheduled_end_time<=w.scheduled_start_time
    OR (w.scheduled_date+w.scheduled_end_time)<(now() AT TIME ZONE coalesce(zone,'America/Chicago')))
 ), page AS (SELECT * FROM flagged ORDER BY CASE WHEN reason='incomplete' THEN 0 ELSE 1 END,scheduled_date NULLS FIRST,id LIMIT least(greatest(p_limit,1),100) OFFSET greatest(p_offset,0))
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page),'[]'),'total',(SELECT count(*) FROM flagged)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_work_orders_needing_attention(integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_work_orders_needing_attention(integer,integer) TO authenticated;
CREATE INDEX IF NOT EXISTS work_orders_attention_idx ON public.work_orders(organization_id,scheduled_date,id) WHERE NOT is_archived AND status NOT IN ('completed','cancelled','archived','split');
NOTIFY pgrst,'reload schema';
