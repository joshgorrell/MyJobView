-- Customer-first recording extends existing time requests and preserves their review boundary.
ALTER TABLE public.manual_job_time_requests ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE public.manual_job_time_requests
  ADD COLUMN work_order_id uuid REFERENCES public.work_orders(id),
  ADD COLUMN contact_id uuid REFERENCES public.contacts(id),
  ADD COLUMN activity_type text,
  ADD CONSTRAINT manual_job_target CHECK (num_nonnulls(project_id,work_order_id)=1 OR (project_id IS NULL AND work_order_id IS NULL AND contact_id IS NOT NULL AND coalesce(activity_type IN ('meeting','site_survey','troubleshooting','other'),false)));
ALTER TABLE public.time_entries
  ADD COLUMN contact_id uuid REFERENCES public.contacts(id),
  ADD COLUMN activity_type text,
  ADD COLUMN work_classification text CHECK(work_classification IN ('project','service','customer_activity'));
ALTER TABLE public.time_entries DROP CONSTRAINT IF EXISTS valid_entry_type;
ALTER TABLE public.time_entries ADD CONSTRAINT valid_entry_type CHECK(entry_type IN ('work_order','project','customer_activity','shop_time','training','sick','vacation','personal','bereavement','jury_duty','unpaid'));
CREATE INDEX time_entries_contact_time ON public.time_entries(contact_id,entry_date) WHERE contact_id IS NOT NULL;
CREATE INDEX manual_time_work_order ON public.manual_job_time_requests(work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX manual_time_contact ON public.manual_job_time_requests(contact_id) WHERE contact_id IS NOT NULL;

-- One canonical classification is derived from the selected work, never a user-entered label.
CREATE OR REPLACE FUNCTION time_private.classify_customer_time()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target_contact uuid; target_project uuid; target_kind text; target_org uuid;
BEGIN
  IF NEW.entry_type='customer_activity' AND EXISTS(SELECT 1 FROM profiles WHERE id=NEW.technician_id AND role IN ('portal_user','customer')) THEN RAISE EXCEPTION 'Employee time is unavailable for portal accounts'; END IF;
  IF NEW.entry_type='customer_activity' AND (NEW.work_order_id IS NOT NULL OR NEW.project_id IS NOT NULL) THEN RAISE EXCEPTION 'Customer activity cannot be linked as project or service work'; END IF;
  IF NEW.work_order_id IS NOT NULL THEN
    SELECT coalesce(w.contact_id,p.contact_id),w.project_id,w.type,w.organization_id
      INTO target_contact,target_project,target_kind,target_org FROM work_orders w LEFT JOIN projects p ON p.id=w.project_id WHERE w.id=NEW.work_order_id;
    IF target_org IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Time target organization mismatch'; END IF;
    IF NEW.project_id IS NOT NULL AND NEW.project_id IS DISTINCT FROM target_project THEN RAISE EXCEPTION 'Work Order project linkage mismatch'; END IF;
    NEW.project_id:=target_project;
    -- A service visit linked to a project remains service work.
    NEW.work_classification:=CASE WHEN target_kind='project' THEN 'project' ELSE 'service' END;
  ELSIF NEW.project_id IS NOT NULL THEN
    SELECT contact_id,organization_id INTO target_contact,target_org FROM projects WHERE id=NEW.project_id;
    IF target_org IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Time target organization mismatch'; END IF;
    NEW.work_classification:='project';
  ELSIF NEW.entry_type='customer_activity' THEN
    target_contact:=NEW.contact_id;
    IF target_contact IS NULL OR NEW.activity_type IS NULL OR NEW.activity_type NOT IN ('meeting','site_survey','troubleshooting','other') OR NEW.internal_session_id IS NOT NULL THEN RAISE EXCEPTION 'Select a customer activity'; END IF;
    NEW.work_classification:='customer_activity';
  ELSE
    IF NEW.contact_id IS NOT NULL OR NEW.activity_type IS NOT NULL THEN RAISE EXCEPTION 'Customer activity requires its own classification'; END IF;
    NEW.work_classification:=NULL;RETURN NEW;
  END IF;
  IF NEW.contact_id IS NOT NULL AND NEW.contact_id IS DISTINCT FROM target_contact THEN RAISE EXCEPTION 'Selected work belongs to another customer'; END IF;
  IF target_contact IS NOT NULL AND NOT EXISTS(SELECT 1 FROM contacts WHERE id=target_contact AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Customer organization mismatch'; END IF;
  IF TG_OP='UPDATE' AND (OLD.contact_id IS DISTINCT FROM NEW.contact_id OR OLD.activity_type IS DISTINCT FROM NEW.activity_type) AND NOT time_private.can_manage_time(NEW.organization_id) THEN RAISE EXCEPTION 'Use the time correction workflow'; END IF;
  NEW.contact_id:=target_contact;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION time_private.classify_customer_time() FROM PUBLIC;
CREATE TRIGGER ab_classify_customer_time BEFORE INSERT OR UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION time_private.classify_customer_time();

CREATE OR REPLACE FUNCTION time_private.validate_manual_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_tz text; target_contact uuid; target_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND organization_id=NEW.organization_id AND is_active IS DISTINCT FROM false AND role NOT IN ('portal_user','customer'))
    OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=NEW.technician_id AND organization_id=NEW.organization_id AND is_active IS DISTINCT FROM false AND role NOT IN ('portal_user','customer'))
    OR (NEW.labor_phase_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM labor_phases WHERE id=NEW.labor_phase_id AND organization_id=NEW.organization_id)) THEN RAISE EXCEPTION 'Time request references a different organization'; END IF;
  IF NEW.work_order_id IS NOT NULL THEN
    SELECT coalesce(w.contact_id,p.contact_id),w.organization_id INTO target_contact,target_org FROM work_orders w LEFT JOIN projects p ON p.id=w.project_id WHERE w.id=NEW.work_order_id;
  ELSIF NEW.project_id IS NOT NULL THEN
    SELECT contact_id,organization_id INTO target_contact,target_org FROM projects WHERE id=NEW.project_id;
  ELSE target_contact:=NEW.contact_id;target_org:=NEW.organization_id;
  END IF;
  IF target_org IS DISTINCT FROM NEW.organization_id OR (NEW.contact_id IS NOT NULL AND NEW.contact_id IS DISTINCT FROM target_contact)
    OR (target_contact IS NOT NULL AND NOT EXISTS(SELECT 1 FROM contacts WHERE id=target_contact AND organization_id=NEW.organization_id)) THEN RAISE EXCEPTION 'Selected work belongs to another customer or organization'; END IF;
  NEW.contact_id:=target_contact;
  IF NEW.work_order_id IS NOT NULL OR NEW.project_id IS NOT NULL THEN NEW.activity_type:=NULL; END IF;
  SELECT coalesce(timezone,'America/Chicago') INTO v_tz FROM organizations WHERE id=NEW.organization_id;
  IF NEW.entry_date<>(NEW.clock_in AT TIME ZONE v_tz)::date OR NEW.clock_out>now() THEN RAISE EXCEPTION 'Use the work date in the organization timezone and time already worked'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION time_private.validate_manual_request() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.review_manual_job_time_request(
  p_request_id uuid,p_action text,p_notes text DEFAULT NULL,
  p_clock_in timestamptz DEFAULT NULL,p_clock_out timestamptz DEFAULT NULL,
  p_break_minutes integer DEFAULT NULL,p_entry_date date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r manual_job_time_requests; v_entry uuid; v_start timestamptz; v_end timestamptz;
  v_break integer; v_day date; v_tz text; v_edited boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO r FROM manual_job_time_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR NOT time_private.can_manage_time(r.organization_id) THEN RAISE EXCEPTION 'Time review permission required'; END IF;
  IF r.technician_id=auth.uid() THEN RAISE EXCEPTION 'Another manager must review your request'; END IF;
  IF p_action NOT IN ('approve','deny') OR p_action IS NULL THEN RAISE EXCEPTION 'Invalid review action'; END IF;
  IF r.status='approved' AND p_action='approve' THEN RETURN r.time_entry_id; END IF;
  IF r.status<>'pending' THEN RAISE EXCEPTION 'Request has already been reviewed'; END IF;
  v_start:=COALESCE(p_clock_in,r.clock_in);v_end:=COALESCE(p_clock_out,r.clock_out);
  v_break:=COALESCE(p_break_minutes,r.break_minutes);v_day:=COALESCE(p_entry_date,r.entry_date);
  v_edited:=v_start IS DISTINCT FROM r.clock_in OR v_end IS DISTINCT FROM r.clock_out
    OR v_break IS DISTINCT FROM r.break_minutes OR v_day IS DISTINCT FROM r.entry_date;
  IF v_edited AND (p_action<>'approve' OR length(trim(COALESCE(p_notes,'')))<3) THEN
    RAISE EXCEPTION 'Explain changes when editing and approving time'; END IF;
  IF p_action='approve' THEN
    SELECT COALESCE(timezone,'America/Chicago') INTO v_tz FROM organizations WHERE id=r.organization_id;
    IF v_end<=v_start OR v_end-v_start>interval '24 hours' OR v_end>now() OR v_break<0
      OR v_break*interval '1 minute'>=v_end-v_start OR (v_start AT TIME ZONE v_tz)::date<>v_day THEN
      RAISE EXCEPTION 'Use valid worked times and the organization work date'; END IF;
    PERFORM time_private.assert_open_time_period(r.technician_id,r.organization_id,r.entry_date);
    IF v_day<>r.entry_date THEN PERFORM time_private.assert_open_time_period(r.technician_id,r.organization_id,v_day); END IF;
    INSERT INTO time_entries(organization_id,technician_id,project_id,work_order_id,contact_id,activity_type,entry_type,entry_date,clock_in,clock_out,
      total_hours,break_minutes,labor_phase_id,notes,status,approved_by,approved_at)
    VALUES(r.organization_id,r.technician_id,r.project_id,r.work_order_id,r.contact_id,r.activity_type,CASE WHEN r.work_order_id IS NOT NULL THEN 'work_order' WHEN r.project_id IS NOT NULL THEN 'project' ELSE 'customer_activity' END,v_day,v_start,v_end,
      extract(epoch FROM v_end-v_start)/3600-v_break/60.0,v_break,r.labor_phase_id,
      r.reason || CASE WHEN v_edited THEN E'\nReview: ' || p_notes ELSE '' END,
      'approved',auth.uid(),now()) RETURNING id INTO v_entry;
  END IF;
  UPDATE manual_job_time_requests SET status=CASE WHEN p_action='approve' THEN 'approved' ELSE 'denied' END,
    reviewed_by=auth.uid(),reviewed_at=now(),review_notes=p_notes,time_entry_id=v_entry,
    review_adjustments=CASE WHEN v_edited THEN jsonb_build_object('entry_date',v_day,'clock_in',v_start,
      'clock_out',v_end,'break_minutes',v_break) ELSE NULL END WHERE id=r.id;
  RETURN v_entry;
END $$;
REVOKE ALL ON FUNCTION public.review_manual_job_time_request(uuid,text,text,timestamptz,timestamptz,integer,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_manual_job_time_request(uuid,text,text,timestamptz,timestamptz,integer,date) TO authenticated;


-- Project/customer timers capture elapsed work without adding payable hours before review.
CREATE TABLE public.customer_time_sessions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  technician_id uuid NOT NULL REFERENCES public.profiles(id),
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  project_id uuid REFERENCES public.projects(id),
  activity_type text NOT NULL CHECK(activity_type IN ('project_work','meeting','site_survey','troubleshooting','other')),
  notes text NOT NULL CHECK(length(btrim(notes))>=3),
  clock_in timestamptz NOT NULL DEFAULT now(),
  clock_out timestamptz,
  start_gps jsonb,stop_gps jsonb,
  request_id uuid UNIQUE REFERENCES public.manual_job_time_requests(id),
  CHECK((project_id IS NOT NULL AND activity_type='project_work') OR (project_id IS NULL AND activity_type<>'project_work')),
  CHECK((clock_out IS NULL AND request_id IS NULL) OR (clock_out>clock_in AND request_id IS NOT NULL))
);
CREATE UNIQUE INDEX customer_time_one_active ON public.customer_time_sessions(technician_id) WHERE clock_out IS NULL;
CREATE INDEX customer_time_org ON public.customer_time_sessions(organization_id,clock_in);
CREATE INDEX customer_time_employee ON public.customer_time_sessions(technician_id,clock_in);
CREATE INDEX customer_time_contact ON public.customer_time_sessions(contact_id);
CREATE INDEX customer_time_project ON public.customer_time_sessions(project_id) WHERE project_id IS NOT NULL;
ALTER TABLE public.customer_time_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_time_sessions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.customer_time_sessions TO authenticated;
GRANT UPDATE(start_gps,stop_gps) ON public.customer_time_sessions TO authenticated;
CREATE POLICY customer_timer_read ON public.customer_time_sessions FOR SELECT TO authenticated USING(organization_id=get_user_org_id() AND EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active IS DISTINCT FROM false) AND (technician_id=auth.uid() OR time_private.can_manage_time(organization_id)));
CREATE POLICY customer_timer_gps ON public.customer_time_sessions FOR UPDATE TO authenticated USING(organization_id=get_user_org_id() AND technician_id=auth.uid() AND EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active IS DISTINCT FROM false)) WITH CHECK(organization_id=get_user_org_id() AND technician_id=auth.uid());

CREATE OR REPLACE FUNCTION public.start_customer_job_time(p_session_id uuid,p_contact_id uuid,p_project_id uuid DEFAULT NULL,p_activity_type text DEFAULT 'other',p_notes text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor profiles; existing customer_time_sessions; v_tz text; v_day date; v_daily boolean; v_shift uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO actor FROM profiles WHERE id=auth.uid() FOR UPDATE;
  IF actor.id IS NULL OR actor.is_active=false OR actor.role IN ('portal_user','customer') THEN RAISE EXCEPTION 'Active employee required'; END IF;
  SELECT * INTO existing FROM customer_time_sessions WHERE id=p_session_id;
  IF FOUND THEN
    IF existing.technician_id<>actor.id OR existing.organization_id<>actor.organization_id OR existing.contact_id IS DISTINCT FROM p_contact_id OR existing.project_id IS DISTINCT FROM p_project_id OR existing.activity_type IS DISTINCT FROM p_activity_type OR existing.notes IS DISTINCT FROM btrim(p_notes) THEN RAISE EXCEPTION 'Timer retry does not match captured work'; END IF;
    RETURN existing.id;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM contacts WHERE id=p_contact_id AND organization_id=actor.organization_id)
    OR (p_project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM projects WHERE id=p_project_id AND organization_id=actor.organization_id AND contact_id=p_contact_id AND status IN ('planning','active'))) THEN RAISE EXCEPTION 'Select this customer’s open project'; END IF;
  IF EXISTS(SELECT 1 FROM time_entries WHERE technician_id=actor.id AND clock_out IS NULL AND status IN ('draft','submitted')) OR EXISTS(SELECT 1 FROM customer_time_sessions WHERE technician_id=actor.id AND clock_out IS NULL) THEN RAISE EXCEPTION 'Stop your active activity before starting another timer'; END IF;
  SELECT coalesce(timezone,'America/Chicago') INTO v_tz FROM organizations WHERE id=actor.organization_id;
  v_day:=(now() AT TIME ZONE v_tz)::date;
  PERFORM time_private.assert_open_time_period(actor.id,actor.organization_id,v_day);
  SELECT c.requires_daily_clock INTO v_daily FROM employees emp JOIN employee_payroll_configs c ON c.employee_id=emp.id
    WHERE emp.user_id=actor.id AND c.organization_id=actor.organization_id AND c.effective_from<=v_day
    AND (c.effective_to IS NULL OR c.effective_to>=v_day) ORDER BY c.effective_from DESC LIMIT 1;
  IF NOT FOUND THEN v_daily:=actor.requires_daily_clock; END IF;
  IF time_private.time_basis(actor.id,v_day)<>'work_allocation' AND v_daily THEN
    SELECT id INTO v_shift FROM daily_clock_entries WHERE technician_id=actor.id AND organization_id=actor.organization_id AND clock_out IS NULL AND clock_in>=now()-interval '24 hours' LIMIT 1;
    IF v_shift IS NULL THEN RAISE EXCEPTION 'Clock in for the day before starting job time'; END IF;
    IF EXISTS(SELECT 1 FROM daily_clock_breaks WHERE daily_clock_entry_id=v_shift AND break_end IS NULL) THEN RAISE EXCEPTION 'End your break before starting job time'; END IF;
  END IF;
  INSERT INTO customer_time_sessions(id,organization_id,technician_id,contact_id,project_id,activity_type,notes)
    VALUES(p_session_id,actor.organization_id,actor.id,p_contact_id,p_project_id,p_activity_type,btrim(p_notes));
  RETURN p_session_id;
END $$;
REVOKE ALL ON FUNCTION public.start_customer_job_time(uuid,uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_customer_job_time(uuid,uuid,uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.stop_customer_job_time(p_session_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor profiles; s customer_time_sessions; v_request uuid; first_request uuid; v_tz text; part_start timestamptz; part_end timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO actor FROM profiles WHERE id=auth.uid() FOR UPDATE;
  IF actor.id IS NULL OR actor.is_active=false THEN RAISE EXCEPTION 'Active employee required'; END IF;
  SELECT * INTO s FROM customer_time_sessions WHERE id=p_session_id AND technician_id=actor.id AND organization_id=actor.organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Own timer not found'; END IF;
  IF s.request_id IS NOT NULL THEN RETURN s.request_id; END IF;
  SELECT coalesce(timezone,'America/Chicago') INTO v_tz FROM organizations WHERE id=s.organization_id;
  part_start:=s.clock_in;
  -- Preserve overnight/long-running evidence without violating the existing 24-hour request limit.
  WHILE part_start<now() LOOP
    part_end:=least(now(),part_start+interval '24 hours');
    INSERT INTO manual_job_time_requests(organization_id,technician_id,contact_id,project_id,activity_type,entry_date,clock_in,clock_out,reason)
      VALUES(s.organization_id,s.technician_id,s.contact_id,s.project_id,CASE WHEN s.project_id IS NULL THEN s.activity_type ELSE NULL END,(part_start AT TIME ZONE v_tz)::date,part_start,part_end,s.notes) RETURNING id INTO v_request;
    first_request:=coalesce(first_request,v_request);part_start:=part_end;
  END LOOP;
  IF first_request IS NULL THEN RAISE EXCEPTION 'Timer has not recorded elapsed work yet'; END IF;
  UPDATE customer_time_sessions SET clock_out=now(),request_id=first_request WHERE id=s.id;
  RETURN first_request;
END $$;
REVOKE ALL ON FUNCTION public.stop_customer_job_time(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.stop_customer_job_time(uuid) TO authenticated;

-- All canonical activity starts serialize on the same employee row used by existing timers.
CREATE OR REPLACE FUNCTION time_private.prevent_customer_timer_overlap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.clock_out IS NULL AND NEW.status IN ('draft','submitted') THEN
    PERFORM 1 FROM profiles WHERE id=NEW.technician_id FOR UPDATE;
    IF EXISTS(SELECT 1 FROM customer_time_sessions WHERE technician_id=NEW.technician_id AND clock_out IS NULL) THEN RAISE EXCEPTION 'Stop your active customer/project timer first'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION time_private.prevent_customer_timer_overlap() FROM PUBLIC;
CREATE TRIGGER ac_customer_timer_overlap BEFORE INSERT OR UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION time_private.prevent_customer_timer_overlap();

-- Allocation employees cannot have pending captured hours silently omitted at payroll finalization.
CREATE OR REPLACE FUNCTION time_private.guard_customer_time_payroll()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.status IN ('payroll_approved','submitted','processed','locked') AND NEW.status IS DISTINCT FROM OLD.status AND EXISTS(
    SELECT 1 FROM (
      SELECT technician_id,organization_id,entry_date FROM manual_job_time_requests WHERE status='pending'
      UNION ALL
      SELECT s.technician_id,s.organization_id,greatest((s.clock_in AT TIME ZONE coalesce(o.timezone,'America/Chicago'))::date,NEW.period_start_date) FROM customer_time_sessions s JOIN organizations o ON o.id=s.organization_id WHERE s.clock_out IS NULL AND (s.clock_in AT TIME ZONE coalesce(o.timezone,'America/Chicago'))::date<=NEW.period_end_date AND (now() AT TIME ZONE coalesce(o.timezone,'America/Chicago'))::date>=NEW.period_start_date
    ) pending
    WHERE pending.organization_id=NEW.organization_id AND pending.entry_date BETWEEN NEW.period_start_date AND NEW.period_end_date
      AND time_private.time_basis(pending.technician_id,pending.entry_date)='work_allocation'
      AND (NEW.pay_schedule_id IS NULL OR EXISTS(SELECT 1 FROM employees e JOIN employee_payroll_configs c ON c.employee_id=e.id WHERE e.user_id=pending.technician_id AND c.organization_id=NEW.organization_id AND c.pay_schedule_id=NEW.pay_schedule_id AND c.effective_from<=pending.entry_date AND (c.effective_to IS NULL OR c.effective_to>=pending.entry_date)))
  ) THEN RAISE EXCEPTION 'Review pending job/customer time and stop active customer timers before finalizing payroll'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION time_private.guard_customer_time_payroll() FROM PUBLIC;
CREATE TRIGGER guard_customer_time_payroll BEFORE UPDATE ON public.pay_periods FOR EACH ROW EXECUTE FUNCTION time_private.guard_customer_time_payroll();
