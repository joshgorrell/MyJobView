-- Employees capture actual internal work immediately. Payroll approval remains separate.
-- Requires the existing employee-time authority migration.
ALTER TABLE public.internal_time_sessions ADD COLUMN employee_started boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION time_private.guard_time_entry_authority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_org uuid; v_basis text; v_session internal_time_sessions;
BEGIN
  -- Trusted maintenance jobs retain their existing behavior. Anonymous API clients have no write policy.
  IF auth.uid() IS NULL THEN
    IF current_setting('request.jwt.claim.role',true) = 'service_role' OR (session_user = 'postgres' AND current_setting('role',true) = 'none' AND COALESCE(current_setting('request.jwt.claim.role',true),'') = '') THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT organization_id INTO v_org FROM profiles WHERE id=NEW.technician_id;
  IF v_org IS NULL OR v_org IS DISTINCT FROM NEW.organization_id
    OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND organization_id=v_org AND is_active IS DISTINCT FROM false)
    THEN RAISE EXCEPTION 'Time entry organization mismatch'; END IF;
  IF NEW.work_order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_orders WHERE id=NEW.work_order_id AND organization_id=v_org)
    OR NEW.project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND organization_id=v_org)
    THEN RAISE EXCEPTION 'Time entry job organization mismatch'; END IF;
  IF NEW.clock_out IS NOT NULL THEN
    IF NEW.clock_out<NEW.clock_in OR COALESCE(NEW.break_minutes,0)<0 THEN RAISE EXCEPTION 'Invalid time interval'; END IF;
    NEW.total_hours:=GREATEST(0,extract(epoch FROM NEW.clock_out-NEW.clock_in)/3600-COALESCE(NEW.break_minutes,0)/60.0);
  END IF;
  IF time_private.can_manage_time(v_org) THEN
    IF NEW.status='approved' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN NEW.approved_by:=auth.uid(); NEW.approved_at:=now(); END IF;
    RETURN NEW;
  END IF;
  IF NEW.technician_id <> auth.uid() THEN RAISE EXCEPTION 'You can only record your own time'; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.status='approved' OR OLD.technician_id IS DISTINCT FROM NEW.technician_id
      OR OLD.organization_id IS DISTINCT FROM NEW.organization_id
      OR OLD.work_order_id IS DISTINCT FROM NEW.work_order_id OR OLD.project_id IS DISTINCT FROM NEW.project_id
      OR OLD.internal_session_id IS DISTINCT FROM NEW.internal_session_id OR OLD.entry_type IS DISTINCT FROM NEW.entry_type
      OR OLD.entry_date IS DISTINCT FROM NEW.entry_date OR OLD.clock_in IS DISTINCT FROM NEW.clock_in
      OR (OLD.clock_out IS NOT NULL AND (OLD.clock_out IS DISTINCT FROM NEW.clock_out OR OLD.break_minutes IS DISTINCT FROM NEW.break_minutes))
    THEN RAISE EXCEPTION 'Use the time correction workflow'; END IF;
  END IF;
  IF NEW.status='approved' OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL
    THEN RAISE EXCEPTION 'Manager approval required'; END IF;
  v_basis := time_private.time_basis(NEW.technician_id,NEW.entry_date);
  IF NEW.work_order_id IS NOT NULL THEN
    IF NEW.entry_type IS DISTINCT FROM 'work_order' OR (TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM work_orders WHERE id=NEW.work_order_id AND assigned_to=auth.uid()))
      THEN RAISE EXCEPTION 'Record job time from your assigned Work Order'; END IF;
  ELSIF v_basis='work_allocation' THEN
    IF NEW.internal_session_id IS NULL THEN RAISE EXCEPTION 'Request manual job or internal time for manager approval'; END IF;
    SELECT * INTO v_session FROM internal_time_sessions WHERE id=NEW.internal_session_id;
    IF NOT FOUND OR v_session.organization_id<>v_org OR v_session.assigned_to<>auth.uid()
      OR v_session.session_date<>NEW.entry_date OR v_session.session_type<>NEW.entry_type
      OR v_session.status NOT IN ('scheduled','in_progress','completed')
      OR (NOT v_session.employee_started AND (v_session.approved_by IS NULL OR v_session.approved_at IS NULL))
      THEN RAISE EXCEPTION 'An approved internal session is required'; END IF;
    IF TG_OP='INSERT' AND v_session.predetermined_hours IS NOT NULL AND NEW.total_hours>v_session.predetermined_hours
      THEN RAISE EXCEPTION 'Time exceeds the approved session duration'; END IF;
    IF EXISTS(SELECT 1 FROM time_entries WHERE internal_session_id=NEW.internal_session_id AND id<>NEW.id)
      THEN RAISE EXCEPTION 'Session time has already been recorded'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION time_private.guard_internal_time_authority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=NEW.assigned_to AND organization_id=NEW.organization_id)
    OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND organization_id=NEW.organization_id AND is_active IS DISTINCT FROM false)
    THEN RAISE EXCEPTION 'Internal time organization mismatch'; END IF;
  IF TG_OP='UPDATE' AND NEW.employee_started IS DISTINCT FROM OLD.employee_started THEN
    RAISE EXCEPTION 'Session capture mode cannot change';
  END IF;
  IF NEW.employee_started THEN
    IF TG_OP='INSERT' THEN
      IF NEW.assigned_to IS DISTINCT FROM auth.uid() OR NEW.requested_by IS DISTINCT FROM auth.uid()
        OR NEW.created_by IS DISTINCT FROM auth.uid() OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL
        OR NEW.predetermined_hours IS NOT NULL OR NEW.status<>'in_progress' THEN
        RAISE EXCEPTION 'Start your own live internal timer without approving payroll';
      END IF;
      RETURN NEW;
    END IF;
    IF time_private.can_manage_time(NEW.organization_id) AND NEW.assigned_to<>auth.uid() THEN RETURN NEW; END IF;
    IF NEW.assigned_to IS DISTINCT FROM auth.uid()
      OR (to_jsonb(OLD)-'status'-'updated_at') IS DISTINCT FROM (to_jsonb(NEW)-'status'-'updated_at')
      OR NOT (OLD.status='in_progress' AND NEW.status='completed')
      OR NOT EXISTS(SELECT 1 FROM time_entries WHERE internal_session_id=OLD.id AND technician_id=auth.uid()
        AND clock_out IS NOT NULL AND status='submitted') THEN
      RAISE EXCEPTION 'Stop your live internal timer; manager approval is separate';
    END IF;
    RETURN NEW;
  END IF;
  IF time_private.can_manage_time(NEW.organization_id) THEN
    IF TG_OP='INSERT' AND NEW.status IN ('scheduled','in_progress','completed')
      OR TG_OP='UPDATE' AND OLD.status='pending_approval' AND NEW.status IN ('scheduled','in_progress','completed') THEN
      NEW.approved_by:=auth.uid(); NEW.approved_at:=now();
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.assigned_to<>auth.uid() THEN RAISE EXCEPTION 'You can only use your own internal session'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.requested_by IS DISTINCT FROM auth.uid() OR NEW.created_by IS DISTINCT FROM auth.uid()
      OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL OR NEW.status<>'pending_approval'
      THEN RAISE EXCEPTION 'Submit an internal time request for manager approval'; END IF;
  ELSE
    IF (to_jsonb(OLD)-'status'-'updated_at') IS DISTINCT FROM (to_jsonb(NEW)-'status'-'updated_at')
      THEN RAISE EXCEPTION 'Use the time request correction workflow'; END IF;
    IF OLD.status='pending_approval' AND NEW.status='cancelled' AND OLD.requested_by=auth.uid() THEN RETURN NEW; END IF;
    IF OLD.approved_by IS NULL OR OLD.approved_at IS NULL
      OR NOT ((OLD.status='scheduled' AND NEW.status='in_progress') OR (OLD.status IN ('scheduled','in_progress') AND NEW.status='completed'))
      THEN RAISE EXCEPTION 'Internal time requires manager approval'; END IF;
    IF NOT EXISTS(SELECT 1 FROM time_entries WHERE internal_session_id=OLD.id AND technician_id=auth.uid()
      AND ((NEW.status='in_progress' AND clock_out IS NULL) OR (NEW.status='completed' AND clock_out IS NOT NULL)))
      THEN RAISE EXCEPTION 'Record the approved session time before changing its status'; END IF;
  END IF;
  RETURN NEW;
END $$;

-- Live capture is distinct from the existing request/pre-authorized-session flow.
-- Employee-started sessions never grant payroll approval, including for managers.
CREATE OR REPLACE FUNCTION time_private.guard_live_internal_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s internal_time_sessions; v_tz text;
BEGIN
  IF NEW.internal_session_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO s FROM internal_time_sessions WHERE id=NEW.internal_session_id;
  IF NOT s.employee_started THEN RETURN NEW; END IF;
  IF NEW.organization_id IS DISTINCT FROM s.organization_id OR NEW.technician_id IS DISTINCT FROM s.assigned_to
    OR NEW.entry_type IS DISTINCT FROM s.session_type OR NEW.entry_date IS DISTINCT FROM s.session_date
    OR NEW.work_order_id IS NOT NULL OR NEW.project_id IS NOT NULL THEN
    RAISE EXCEPTION 'Internal timer must match its assigned session';
  END IF;
  IF NEW.status='approved' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    IF NEW.technician_id=auth.uid() OR NOT time_private.can_manage_time(s.organization_id) OR NEW.clock_out IS NULL THEN
      RAISE EXCEPTION 'Another manager must approve completed internal time';
    END IF;
  END IF;
  IF TG_OP='UPDATE' AND OLD.status='approved' AND NEW.technician_id=auth.uid() THEN
    RAISE EXCEPTION 'Use the time correction workflow';
  END IF;
  IF TG_OP='INSERT' THEN
    SELECT COALESCE(timezone,'America/Chicago') INTO v_tz FROM organizations WHERE id=s.organization_id;
    IF NEW.entry_date IS DISTINCT FROM (NEW.clock_in AT TIME ZONE v_tz)::date THEN
      RAISE EXCEPTION 'Use the current organization work date';
    END IF;
    IF auth.uid() IS DISTINCT FROM NEW.technician_id OR NEW.clock_out IS NOT NULL OR NEW.status<>'draft'
      OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL OR COALESCE(NEW.break_minutes,0)<>0
      OR abs(extract(epoch FROM now()-NEW.clock_in))>120 THEN
      RAISE EXCEPTION 'Use the live internal timer to record current work';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION time_private.guard_live_internal_entry() FROM PUBLIC;
CREATE TRIGGER guard_live_internal_entry BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION time_private.guard_live_internal_entry();

CREATE POLICY its_employee_live_read ON public.internal_time_sessions FOR SELECT TO authenticated
  USING(organization_id=get_user_org_id() AND assigned_to=auth.uid() AND employee_started);
CREATE POLICY its_employee_live_insert ON public.internal_time_sessions FOR INSERT TO authenticated
  WITH CHECK(organization_id=get_user_org_id() AND assigned_to=auth.uid() AND employee_started
    AND approved_by IS NULL AND approved_at IS NULL AND status='in_progress');
CREATE POLICY its_employee_live_stop ON public.internal_time_sessions FOR UPDATE TO authenticated
  USING(organization_id=get_user_org_id() AND assigned_to=auth.uid() AND employee_started AND status='in_progress')
  WITH CHECK(organization_id=get_user_org_id() AND assigned_to=auth.uid() AND employee_started AND status='completed');

CREATE OR REPLACE FUNCTION public.start_internal_time(p_session_id uuid,p_session_type text,p_reason text DEFAULT NULL,p_evidence jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a profiles; s internal_time_sessions; e time_entries; v_tz text; v_day date; v_daily boolean; v_shift uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO a FROM profiles WHERE id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR a.is_active=false OR a.organization_id IS NULL THEN RAISE EXCEPTION 'Active employee required'; END IF;
  IF p_session_id IS NULL OR p_session_type IS NULL OR p_session_type NOT IN ('shop_time','training') THEN RAISE EXCEPTION 'Choose Shop Time or Training'; END IF;
  SELECT * INTO s FROM internal_time_sessions WHERE id=p_session_id;
  IF FOUND THEN
    IF s.organization_id IS DISTINCT FROM a.organization_id OR s.assigned_to IS DISTINCT FROM a.id
      OR s.session_type IS DISTINCT FROM p_session_type THEN RAISE EXCEPTION 'Session belongs to another employee'; END IF;
    SELECT * INTO e FROM time_entries WHERE internal_session_id=s.id AND technician_id=a.id;
    IF FOUND THEN
      IF e.clock_out IS NULL AND e.status IN ('draft','submitted') THEN RETURN e.id; END IF;
      RAISE EXCEPTION 'This session already has recorded time';
    END IF;
    IF s.employee_started OR s.status<>'scheduled' OR s.approved_by IS NULL OR s.approved_at IS NULL THEN
      RAISE EXCEPTION 'Session is not available for a timer';
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM time_entries WHERE technician_id=a.id AND clock_out IS NULL AND status IN ('draft','submitted')) THEN
    RAISE EXCEPTION 'Stop your active job or internal timer first';
  END IF;
  SELECT COALESCE(timezone,'America/Chicago') INTO v_tz FROM organizations WHERE id=a.organization_id;
  v_day:=(now() AT TIME ZONE v_tz)::date;
  IF s.id IS NOT NULL AND s.session_date<>v_day THEN RAISE EXCEPTION 'Use a session scheduled for today'; END IF;
  PERFORM time_private.assert_open_time_period(a.id,a.organization_id,v_day);
  SELECT c.requires_daily_clock INTO v_daily FROM employees emp JOIN employee_payroll_configs c ON c.employee_id=emp.id
    WHERE emp.user_id=a.id AND c.organization_id=a.organization_id AND c.effective_from<=v_day
      AND (c.effective_to IS NULL OR c.effective_to>=v_day) ORDER BY c.effective_from DESC LIMIT 1;
  IF NOT FOUND THEN v_daily:=a.requires_daily_clock; END IF;
  IF time_private.time_basis(a.id,v_day)<>'work_allocation' AND v_daily THEN
    SELECT id INTO v_shift FROM daily_clock_entries WHERE technician_id=a.id AND organization_id=a.organization_id
      AND clock_out IS NULL AND clock_in>=now()-interval '24 hours' LIMIT 1;
    IF v_shift IS NULL THEN RAISE EXCEPTION 'Clock in for the day before starting internal time'; END IF;
    IF EXISTS(SELECT 1 FROM daily_clock_breaks WHERE daily_clock_entry_id=v_shift AND break_end IS NULL) THEN
      RAISE EXCEPTION 'End your break before starting internal time';
    END IF;
  END IF;
  IF s.id IS NULL THEN
    INSERT INTO internal_time_sessions(id,organization_id,assigned_to,created_by,requested_by,session_type,title,
      description,request_reason,session_date,status,employee_started)
    VALUES(p_session_id,a.organization_id,a.id,a.id,a.id,p_session_type,
      CASE p_session_type WHEN 'shop_time' THEN 'Shop Time' ELSE 'Training' END,
      NULLIF(btrim(p_reason),''),NULLIF(btrim(p_reason),''),v_day,'in_progress',true) RETURNING * INTO s;
  END IF;
  INSERT INTO time_entries(organization_id,technician_id,internal_session_id,entry_type,entry_date,
    clock_in,clock_out,total_hours,break_minutes,status,
    clock_in_gps_attempted_at,clock_in_gps_capture_method,clock_in_latitude,clock_in_longitude,
    clock_in_gps_accuracy,clock_in_gps_captured_at,clock_in_gps_duration_ms)
  VALUES(a.organization_id,a.id,s.id,s.session_type,v_day,now(),NULL,0,0,'draft',
    now(),COALESCE(p_evidence->>'clock_in_gps_capture_method','none'),
    (p_evidence->>'clock_in_latitude')::double precision,(p_evidence->>'clock_in_longitude')::double precision,
    (p_evidence->>'clock_in_gps_accuracy')::double precision,(p_evidence->>'clock_in_gps_captured_at')::timestamptz,
    (p_evidence->>'clock_in_gps_duration_ms')::integer) RETURNING id INTO e.id;
  IF s.status<>'in_progress' THEN UPDATE internal_time_sessions SET status='in_progress' WHERE id=s.id; END IF;
  RETURN e.id;
END $$;
REVOKE ALL ON FUNCTION public.start_internal_time(uuid,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_internal_time(uuid,text,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.stop_internal_time(p_session_id uuid,p_notes text DEFAULT NULL,p_evidence jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a profiles; s internal_time_sessions; e time_entries;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO a FROM profiles WHERE id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR a.is_active=false THEN RAISE EXCEPTION 'Active employee required'; END IF;
  SELECT * INTO s FROM internal_time_sessions WHERE id=p_session_id AND organization_id=a.organization_id AND assigned_to=a.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assigned session not found'; END IF;
  SELECT * INTO e FROM time_entries WHERE internal_session_id=s.id AND technician_id=a.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No recorded timer found'; END IF;
  IF e.clock_out IS NOT NULL AND s.status='completed' THEN RETURN e.id; END IF;
  PERFORM time_private.assert_open_time_period(a.id,a.organization_id,e.entry_date);
  IF e.clock_out IS NULL THEN
    UPDATE time_entries SET clock_out=now(),status='submitted',notes=NULLIF(btrim(p_notes),''),
      clock_out_gps_attempted_at=now(),clock_out_gps_capture_method=COALESCE(p_evidence->>'clock_out_gps_capture_method','none'),
      clock_out_latitude=(p_evidence->>'clock_out_latitude')::double precision,clock_out_longitude=(p_evidence->>'clock_out_longitude')::double precision,
      clock_out_gps_accuracy=(p_evidence->>'clock_out_gps_accuracy')::double precision,
      clock_out_gps_captured_at=(p_evidence->>'clock_out_gps_captured_at')::timestamptz,
      clock_out_gps_duration_ms=(p_evidence->>'clock_out_gps_duration_ms')::integer
    WHERE id=e.id;
  END IF;
  IF s.status<>'completed' THEN UPDATE internal_time_sessions SET status='completed' WHERE id=s.id; END IF;
  RETURN e.id;
END $$;
REVOKE ALL ON FUNCTION public.stop_internal_time(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.stop_internal_time(uuid,text,jsonb) TO authenticated;

-- A Daily Clock already includes internal work in attendance; never add an
-- additional internal payroll segment. Instead require review before finalizing
-- a period that contains employee-started work awaiting approval.
CREATE OR REPLACE FUNCTION time_private.guard_internal_payroll_finalization()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_tz text;
BEGIN
  IF NEW.status NOT IN ('payroll_approved','submitted','processed','locked') OR NEW.status=OLD.status THEN RETURN NEW; END IF;
  SELECT COALESCE(timezone,'America/Chicago') INTO v_tz FROM organizations WHERE id=NEW.organization_id;
  IF EXISTS(
    SELECT 1 FROM time_entries e JOIN internal_time_sessions s ON s.id=e.internal_session_id
    LEFT JOIN LATERAL (
      SELECT c.pay_schedule_id,c.payroll_time_basis FROM employees emp JOIN employee_payroll_configs c ON c.employee_id=emp.id
      WHERE emp.user_id=e.technician_id AND c.organization_id=NEW.organization_id AND c.effective_from<=e.entry_date
        AND (c.effective_to IS NULL OR c.effective_to>=e.entry_date) ORDER BY c.effective_from DESC LIMIT 1
    ) config ON true
    WHERE s.employee_started AND e.organization_id=NEW.organization_id AND e.status IN ('draft','submitted')
      AND e.clock_in<((NEW.period_end_date+1)::timestamp AT TIME ZONE v_tz)
      AND COALESCE(e.clock_out,now())>(NEW.period_start_date::timestamp AT TIME ZONE v_tz)
      AND (NEW.pay_schedule_id IS NULL OR config.pay_schedule_id=NEW.pay_schedule_id)
      AND COALESCE(config.payroll_time_basis,'work_allocation')<>'salary'
  ) THEN RAISE EXCEPTION 'Review pending Shop Time and Training before finalizing payroll'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION time_private.guard_internal_payroll_finalization() FROM PUBLIC;
CREATE TRIGGER guard_internal_payroll_finalization BEFORE UPDATE OF status ON public.pay_periods
  FOR EACH ROW EXECUTE FUNCTION time_private.guard_internal_payroll_finalization();

CREATE OR REPLACE FUNCTION time_private.notify_live_internal_time_submitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_ids uuid[];v_name text;v_hours numeric;v_recipient uuid;
BEGIN
  IF NOT NEW.employee_started OR NEW.status<>'completed' OR OLD.status=NEW.status THEN RETURN NEW; END IF;
  SELECT time_request_approver_ids INTO v_ids FROM company_settings WHERE organization_id=NEW.organization_id LIMIT 1;
  SELECT COALESCE(full_name,email,'An employee') INTO v_name FROM profiles WHERE id=NEW.assigned_to;
  SELECT total_hours INTO v_hours FROM time_entries WHERE internal_session_id=NEW.id;
  FOR v_recipient IN SELECT id FROM profiles WHERE id=ANY(COALESCE(v_ids,ARRAY[]::uuid[]))
    AND organization_id=NEW.organization_id AND is_active IS DISTINCT FROM false
    AND role IN ('admin','manager','service_manager','office_manager','production_manager','sales_manager')
    AND id<>NEW.assigned_to LOOP
    INSERT INTO notifications(user_id,organization_id,type,title,body,related_id,is_read)
    VALUES(v_recipient,NEW.organization_id,'internal_time_request_submitted',
      v_name||' submitted '||CASE NEW.session_type WHEN 'shop_time' THEN 'Shop Time' ELSE 'Training' END,
      round(COALESCE(v_hours,0),2)||' hour(s) recorded. Review completed time for payroll approval.',NEW.id,false);
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION time_private.notify_live_internal_time_submitted() FROM PUBLIC;
CREATE TRIGGER notify_live_internal_time_submitted AFTER UPDATE OF status ON public.internal_time_sessions
  FOR EACH ROW EXECUTE FUNCTION time_private.notify_live_internal_time_submitted();
