-- Employee requests do not create payable hours. Review creates one canonical entry atomically.
CREATE SCHEMA IF NOT EXISTS time_private;
REVOKE ALL ON SCHEMA time_private FROM PUBLIC;

CREATE OR REPLACE FUNCTION time_private.can_manage_time(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND organization_id = p_org AND is_active IS DISTINCT FROM false
    AND role IN ('admin','manager','service_manager','office_manager','production_manager','sales_manager'));
$$;
REVOKE ALL ON FUNCTION time_private.can_manage_time(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA time_private TO authenticated;
GRANT EXECUTE ON FUNCTION time_private.can_manage_time(uuid) TO authenticated;

-- Protect the legacy fallback and the roles used to authorize time review.
CREATE OR REPLACE FUNCTION time_private.guard_profile_time_authority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.employment_type IS DISTINCT FROM OLD.employment_type
    OR NEW.requires_daily_clock IS DISTINCT FROM OLD.requires_daily_clock
    OR NEW.is_active IS DISTINCT FROM OLD.is_active
    OR NEW.role IS DISTINCT FROM OLD.role OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    IF auth.uid() IS NULL AND (current_setting('request.jwt.claim.role',true)='service_role'
      OR (session_user='postgres' AND current_setting('role',true)='none'
        AND COALESCE(current_setting('request.jwt.claim.role',true),'')='')) THEN RETURN NEW; END IF;
    IF NOT time_private.can_manage_time(OLD.organization_id)
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Time classification and review permissions require an authorized manager';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION time_private.guard_profile_time_authority() FROM PUBLIC;
CREATE TRIGGER guard_profile_time_authority BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION time_private.guard_profile_time_authority();

CREATE OR REPLACE FUNCTION time_private.time_basis(p_user uuid, p_date date)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT c.payroll_time_basis FROM employees e JOIN employee_payroll_configs c ON c.employee_id = e.id
    WHERE e.user_id = p_user AND c.organization_id = p.organization_id
      AND c.effective_from <= p_date AND (c.effective_to IS NULL OR c.effective_to >= p_date)
    ORDER BY c.effective_from DESC LIMIT 1),
    CASE p.employment_type WHEN 'job_time' THEN 'work_allocation' WHEN 'salary' THEN 'salary' ELSE 'daily_clock' END)
  FROM profiles p WHERE p.id = p_user;
$$;
REVOKE ALL ON FUNCTION time_private.time_basis(uuid,date) FROM PUBLIC;

CREATE TABLE public.manual_job_time_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT get_user_org_id() REFERENCES organizations(id),
  technician_id uuid NOT NULL REFERENCES profiles(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  entry_date date NOT NULL,
  clock_in timestamptz NOT NULL,
  clock_out timestamptz NOT NULL,
  break_minutes integer NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
  labor_phase_id uuid REFERENCES labor_phases(id),
  reason text NOT NULL CHECK (length(trim(reason)) >= 3),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','cancelled')),
  reviewed_by uuid REFERENCES profiles(id), reviewed_at timestamptz, review_notes text,
  time_entry_id uuid UNIQUE REFERENCES time_entries(id),
  review_adjustments jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (clock_out > clock_in AND clock_out - clock_in <= interval '24 hours'),
  CHECK (extract(epoch FROM clock_out - clock_in)/60 > break_minutes)
);
ALTER TABLE public.manual_job_time_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manual_job_time_requests FROM anon, authenticated;
GRANT SELECT, INSERT ON public.manual_job_time_requests TO authenticated;
CREATE POLICY manual_time_read ON public.manual_job_time_requests FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id() AND (technician_id = auth.uid() OR time_private.can_manage_time(organization_id)));
CREATE POLICY manual_time_request ON public.manual_job_time_requests FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org_id() AND technician_id = auth.uid() AND status = 'pending'
    AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_notes IS NULL AND review_adjustments IS NULL AND time_entry_id IS NULL);
CREATE INDEX manual_time_pending ON public.manual_job_time_requests(organization_id, status, created_at);

CREATE OR REPLACE FUNCTION time_private.validate_manual_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tz text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = NEW.technician_id AND organization_id = NEW.organization_id)
    OR NOT EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id AND organization_id = NEW.organization_id)
    OR (NEW.labor_phase_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM labor_phases WHERE id = NEW.labor_phase_id AND organization_id = NEW.organization_id))
  THEN RAISE EXCEPTION 'Time request references a different organization'; END IF;
  SELECT COALESCE(timezone,'America/Chicago') INTO v_tz FROM organizations WHERE id = NEW.organization_id;
  IF NEW.entry_date <> (NEW.clock_in AT TIME ZONE v_tz)::date OR NEW.clock_out > now() THEN
    RAISE EXCEPTION 'Use the work date in the organization timezone and time already worked';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION time_private.validate_manual_request() FROM PUBLIC;
CREATE TRIGGER validate_manual_time_request BEFORE INSERT ON public.manual_job_time_requests
  FOR EACH ROW EXECUTE FUNCTION time_private.validate_manual_request();



CREATE OR REPLACE FUNCTION time_private.assert_open_time_period(p_user uuid,p_org uuid,p_day date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_schedule uuid;
BEGIN
  SELECT c.pay_schedule_id INTO v_schedule FROM employee_payroll_configs c
    JOIN employees e ON e.id=c.employee_id AND e.organization_id=c.organization_id
    WHERE e.user_id=p_user AND c.organization_id=p_org AND c.effective_from<=p_day
      AND (c.effective_to IS NULL OR c.effective_to>=p_day)
    ORDER BY c.effective_from DESC LIMIT 1;
  PERFORM 1 FROM pay_periods WHERE organization_id=p_org
    AND (pay_schedule_id IS NULL OR pay_schedule_id=v_schedule)
    AND p_day BETWEEN period_start_date AND period_end_date FOR SHARE;
  IF EXISTS(SELECT 1 FROM pay_periods WHERE organization_id=p_org
    AND (pay_schedule_id IS NULL OR pay_schedule_id=v_schedule)
    AND p_day BETWEEN period_start_date AND period_end_date
    AND status IN ('payroll_approved','submitted','processed','locked')) THEN
    RAISE EXCEPTION 'Reopen the payroll period or use payroll corrections before adding time';
  END IF;
END $$;
REVOKE ALL ON FUNCTION time_private.assert_open_time_period(uuid,uuid,date) FROM PUBLIC;

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
    INSERT INTO time_entries(organization_id,technician_id,project_id,entry_type,entry_date,clock_in,clock_out,
      total_hours,break_minutes,labor_phase_id,notes,status,approved_by,approved_at)
    VALUES(r.organization_id,r.technician_id,r.project_id,'project',v_day,v_start,v_end,
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

CREATE OR REPLACE FUNCTION public.review_internal_time(p_session_id uuid,p_action text,p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s internal_time_sessions; e time_entries; v_tz text; v_start timestamptz; v_end timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO s FROM internal_time_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND OR NOT time_private.can_manage_time(s.organization_id) THEN RAISE EXCEPTION 'Time review permission required'; END IF;
  IF p_action NOT IN ('approve','deny','complete','approve_time') OR p_action IS NULL THEN RAISE EXCEPTION 'Invalid review action'; END IF;
  IF p_action IN ('approve','deny','approve_time') AND s.assigned_to=auth.uid() THEN
    RAISE EXCEPTION 'Another manager must review your time'; END IF;
  SELECT * INTO e FROM time_entries WHERE internal_session_id=s.id FOR UPDATE;
  IF p_action='approve' THEN
    IF s.status IN ('scheduled','in_progress','completed') AND s.approved_by IS NOT NULL THEN RETURN e.id; END IF;
    IF s.status<>'pending_approval' THEN RAISE EXCEPTION 'Request has already been reviewed'; END IF;
    -- Approving a request authorizes work; it does not invent a future worked interval.
    UPDATE internal_time_sessions SET status='scheduled',approved_by=auth.uid(),approved_at=now() WHERE id=s.id;
    RETURN NULL;
  ELSIF p_action='deny' THEN
    IF s.status='denied' THEN RETURN NULL; END IF;
    IF s.status<>'pending_approval' THEN RAISE EXCEPTION 'Request has already been reviewed'; END IF;
    UPDATE internal_time_sessions SET status='denied',denial_reason=p_notes WHERE id=s.id;
    RETURN NULL;
  ELSIF p_action='complete' THEN
    IF s.status='completed' AND e.clock_out IS NOT NULL THEN RETURN e.id; END IF;
    IF s.status<>'scheduled' OR s.approved_by IS NULL OR s.predetermined_hours IS NULL
      OR s.predetermined_hours<=0 OR s.predetermined_hours>24 THEN RAISE EXCEPTION 'Use a scheduled approved session with a valid duration'; END IF;
    IF e.id IS NOT NULL THEN RAISE EXCEPTION 'Stop the recorded session timer instead'; END IF;
    SELECT COALESCE(timezone,'America/Chicago') INTO v_tz FROM organizations WHERE id=s.organization_id;
    v_start:=(s.session_date+COALESCE(s.start_time,'08:00'::time)) AT TIME ZONE v_tz;
    v_end:=v_start+s.predetermined_hours*interval '1 hour';
    IF v_end>now() THEN RAISE EXCEPTION 'Complete time only after the scheduled work has been performed'; END IF;
    PERFORM time_private.assert_open_time_period(s.assigned_to,s.organization_id,s.session_date);
    INSERT INTO time_entries(organization_id,technician_id,internal_session_id,entry_type,entry_date,clock_in,
      clock_out,total_hours,break_minutes,status,notes)
    VALUES(s.organization_id,s.assigned_to,s.id,s.session_type,s.session_date,v_start,v_end,
      s.predetermined_hours,0,'submitted',COALESCE(s.description,s.request_reason)) RETURNING * INTO e;
    UPDATE internal_time_sessions SET status='completed' WHERE id=s.id;
    RETURN e.id;
  ELSE
    IF e.id IS NULL OR e.clock_out IS NULL THEN RAISE EXCEPTION 'Record completed session time before approving pay'; END IF;
    IF e.status='approved' THEN RETURN e.id; END IF;
    IF e.status<>'submitted' OR s.status<>'completed' THEN RAISE EXCEPTION 'Only submitted completed session time can be approved'; END IF;
    PERFORM time_private.assert_open_time_period(s.assigned_to,s.organization_id,e.entry_date);
    UPDATE time_entries SET status='approved',approved_by=auth.uid(),approved_at=now() WHERE id=e.id;
    UPDATE internal_time_sessions SET approved_by=auth.uid(),approved_at=now() WHERE id=s.id;
    RETURN e.id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.review_internal_time(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_internal_time(uuid,text,text) TO authenticated;

-- A trigger supplements existing RLS so another insert/update path cannot bypass these controls.
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
      OR v_session.approved_by IS NULL OR v_session.approved_at IS NULL
      THEN RAISE EXCEPTION 'An approved internal session is required'; END IF;
    IF TG_OP='INSERT' AND v_session.predetermined_hours IS NOT NULL AND NEW.total_hours>v_session.predetermined_hours
      THEN RAISE EXCEPTION 'Time exceeds the approved session duration'; END IF;
    IF EXISTS(SELECT 1 FROM time_entries WHERE internal_session_id=NEW.internal_session_id AND id<>NEW.id)
      THEN RAISE EXCEPTION 'Session time has already been recorded'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION time_private.guard_time_entry_authority() FROM PUBLIC;
CREATE TRIGGER guard_employee_time_authority BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION time_private.guard_time_entry_authority();

CREATE OR REPLACE FUNCTION time_private.guard_internal_time_authority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=NEW.assigned_to AND organization_id=NEW.organization_id)
    OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND organization_id=NEW.organization_id AND is_active IS DISTINCT FROM false)
    THEN RAISE EXCEPTION 'Internal time organization mismatch'; END IF;
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
REVOKE ALL ON FUNCTION time_private.guard_internal_time_authority() FROM PUBLIC;
CREATE TRIGGER guard_internal_time_authority BEFORE INSERT OR UPDATE ON public.internal_time_sessions
  FOR EACH ROW EXECUTE FUNCTION time_private.guard_internal_time_authority();

-- Give assigned employees only the approved session lifecycle; the trigger locks approval/identity/hours.
CREATE POLICY its_employee_lifecycle ON public.internal_time_sessions FOR UPDATE TO authenticated
  USING (organization_id=get_user_org_id() AND assigned_to=auth.uid() AND approved_by IS NOT NULL
    AND status IN ('scheduled','in_progress'))
  WITH CHECK (organization_id=get_user_org_id() AND assigned_to=auth.uid() AND approved_by IS NOT NULL
    AND status IN ('in_progress','completed'));
CREATE POLICY its_time_manager_select ON public.internal_time_sessions FOR SELECT TO authenticated
  USING (organization_id=get_user_org_id() AND time_private.can_manage_time(organization_id));
CREATE POLICY its_time_manager_insert ON public.internal_time_sessions FOR INSERT TO authenticated
  WITH CHECK (organization_id=get_user_org_id() AND time_private.can_manage_time(organization_id));
CREATE POLICY its_time_manager_update ON public.internal_time_sessions FOR UPDATE TO authenticated
  USING (organization_id=get_user_org_id() AND time_private.can_manage_time(organization_id))
  WITH CHECK (organization_id=get_user_org_id() AND time_private.can_manage_time(organization_id));
-- Preflight duplicates before release; never delete or collapse historical payable records automatically.
CREATE UNIQUE INDEX one_entry_per_internal_session ON public.time_entries(internal_session_id) WHERE internal_session_id IS NOT NULL;

-- Existing SECURITY DEFINER employee setup RPCs bypass RLS. Check the actor
-- again at the row boundary, including disabled managers with valid tokens.
CREATE OR REPLACE FUNCTION time_private.guard_employee_config_authority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  IF auth.uid() IS NULL AND (current_setting('request.jwt.claim.role',true)='service_role'
    OR (session_user='postgres' AND current_setting('role',true)='none'
      AND COALESCE(current_setting('request.jwt.claim.role',true),'')='')) THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP='INSERT' THEN v_org:=NEW.organization_id; ELSE v_org:=OLD.organization_id; END IF;
  IF NOT time_private.can_manage_time(v_org) THEN
    RAISE EXCEPTION 'Employee configuration requires an authorized manager';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF NEW.organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'Employee configuration cannot change organizations';
  END IF;
  IF TG_TABLE_NAME='employees' THEN
    IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=NEW.user_id AND organization_id=v_org) THEN
      RAISE EXCEPTION 'Employee profile belongs to a different organization';
    END IF;
    IF TG_OP='UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Employee profile identity cannot be reassigned';
    END IF;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM employees WHERE id=NEW.employee_id AND organization_id=v_org) THEN
      RAISE EXCEPTION 'Payroll configuration employee belongs to a different organization';
    END IF;
    IF TG_OP='UPDATE' AND NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
      RAISE EXCEPTION 'Payroll configuration identity cannot be reassigned';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION time_private.guard_employee_config_authority() FROM PUBLIC;
CREATE TRIGGER guard_employee_config_authority BEFORE INSERT OR UPDATE OR DELETE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION time_private.guard_employee_config_authority();
CREATE TRIGGER guard_employee_config_authority BEFORE INSERT OR UPDATE OR DELETE ON public.employee_payroll_configs
  FOR EACH ROW EXECUTE FUNCTION time_private.guard_employee_config_authority();

-- Employees cannot reclassify themselves to evade the non-WO approval rule.
DROP POLICY IF EXISTS insert_employee_payroll_configs ON public.employee_payroll_configs;
DROP POLICY IF EXISTS update_employee_payroll_configs ON public.employee_payroll_configs;
DROP POLICY IF EXISTS delete_employee_payroll_configs ON public.employee_payroll_configs;
CREATE POLICY time_config_insert ON public.employee_payroll_configs FOR INSERT TO authenticated
  WITH CHECK (organization_id=get_user_org_id() AND time_private.can_manage_time(organization_id)
    AND EXISTS(SELECT 1 FROM employees e WHERE e.id=employee_id AND e.organization_id=employee_payroll_configs.organization_id));
CREATE POLICY time_config_update ON public.employee_payroll_configs FOR UPDATE TO authenticated
  USING (organization_id=get_user_org_id() AND time_private.can_manage_time(organization_id))
  WITH CHECK (organization_id=get_user_org_id() AND time_private.can_manage_time(organization_id)
    AND EXISTS(SELECT 1 FROM employees e WHERE e.id=employee_id AND e.organization_id=employee_payroll_configs.organization_id));
CREATE POLICY time_config_delete ON public.employee_payroll_configs FOR DELETE TO authenticated
  USING (organization_id=get_user_org_id() AND time_private.can_manage_time(organization_id));
DROP POLICY IF EXISTS insert_employees ON public.employees;
DROP POLICY IF EXISTS update_employees ON public.employees;
DROP POLICY IF EXISTS delete_employees ON public.employees;
CREATE POLICY time_employee_insert ON public.employees FOR INSERT TO authenticated
  WITH CHECK (organization_id=get_user_org_id() AND time_private.can_manage_time(organization_id)
    AND EXISTS(SELECT 1 FROM profiles p WHERE p.id=user_id AND p.organization_id=employees.organization_id));
CREATE POLICY time_employee_update ON public.employees FOR UPDATE TO authenticated
  USING (organization_id=get_user_org_id() AND time_private.can_manage_time(organization_id))
  WITH CHECK (organization_id=get_user_org_id() AND time_private.can_manage_time(organization_id)
    AND EXISTS(SELECT 1 FROM profiles p WHERE p.id=user_id AND p.organization_id=employees.organization_id));
CREATE POLICY time_employee_delete ON public.employees FOR DELETE TO authenticated
  USING (organization_id=get_user_org_id() AND time_private.can_manage_time(organization_id));

CREATE OR REPLACE FUNCTION public.start_work_order_time(p_work_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE w work_orders; v_actor profiles; v_id uuid; v_tz text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  -- Serialize starts for this employee, including repeated taps from two clients.
  SELECT * INTO v_actor FROM profiles WHERE id=auth.uid() FOR UPDATE;
  IF v_actor.is_active=false THEN RAISE EXCEPTION 'Active employee required'; END IF;
  SELECT * INTO w FROM work_orders WHERE id=p_work_order_id;
  IF NOT FOUND OR w.organization_id IS DISTINCT FROM v_actor.organization_id OR w.assigned_to IS DISTINCT FROM auth.uid()
    THEN RAISE EXCEPTION 'Use your assigned Work Order'; END IF;
  IF w.status NOT IN ('pending','assigned','in_progress') THEN RAISE EXCEPTION 'Work Order is not available for job time'; END IF;
  SELECT id INTO v_id FROM time_entries WHERE technician_id=auth.uid() AND work_order_id=w.id
    AND clock_out IS NULL AND status IN ('draft','submitted') LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  IF EXISTS(SELECT 1 FROM time_entries WHERE technician_id=auth.uid() AND clock_out IS NULL AND status IN ('draft','submitted'))
    THEN RAISE EXCEPTION 'Stop the active activity before starting another Work Order'; END IF;
  SELECT COALESCE(timezone,'America/Chicago') INTO v_tz FROM organizations WHERE id=w.organization_id;
  INSERT INTO time_entries(organization_id,technician_id,work_order_id,entry_type,entry_date,clock_in,status,labor_phase_id)
    VALUES(w.organization_id,auth.uid(),w.id,'work_order',(now() AT TIME ZONE v_tz)::date,now(),'draft',w.labor_phase_id)
    RETURNING id INTO v_id;
  UPDATE work_orders SET status='in_progress' WHERE id=w.id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.start_work_order_time(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_work_order_time(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION time_private.guard_daily_clock_classification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_enabled boolean;
BEGIN
  IF time_private.time_basis(NEW.technician_id,NEW.entry_date)='work_allocation'
    THEN RAISE EXCEPTION 'Job Time employees do not use the Daily Clock'; END IF;
  SELECT c.requires_daily_clock INTO v_enabled FROM employees e JOIN employee_payroll_configs c ON c.employee_id=e.id
    JOIN profiles p ON p.id=e.user_id AND p.organization_id=c.organization_id
    WHERE e.user_id=NEW.technician_id AND c.effective_from<=NEW.entry_date
      AND (c.effective_to IS NULL OR c.effective_to>=NEW.entry_date)
    ORDER BY c.effective_from DESC LIMIT 1;
  IF NOT FOUND THEN SELECT requires_daily_clock INTO v_enabled FROM profiles WHERE id=NEW.technician_id; END IF;
  IF v_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'Daily Clock is not enabled in the employee payroll configuration'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION time_private.guard_daily_clock_classification() FROM PUBLIC;
CREATE TRIGGER guard_daily_clock_classification BEFORE INSERT ON public.daily_clock_entries
  FOR EACH ROW EXECUTE FUNCTION time_private.guard_daily_clock_classification();
CREATE UNIQUE INDEX one_active_work_activity ON public.time_entries(technician_id)
  WHERE clock_out IS NULL AND status IN ('draft','submitted');
CREATE OR REPLACE FUNCTION public.get_appointments_with_privacy(p_user_id uuid, p_company_id uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date)
 RETURNS TABLE(id uuid, company_id uuid, project_id uuid, contact_id uuid, title text, description text, appointment_date date, start_time time without time zone, end_time time without time zone, status text, assigned_technician uuid, location text, notes text, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, appointment_type text, is_private boolean, all_day boolean, is_blocked boolean, can_view_details boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_user_role text;
v_is_admin boolean;
BEGIN
IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Authenticated calendar owner required'; END IF;
IF p_company_id IS DISTINCT FROM auth.uid() AND p_company_id IS DISTINCT FROM get_user_org_id() THEN RAISE EXCEPTION 'Calendar organization mismatch'; END IF;
-- Get user role
SELECT role INTO v_user_role
FROM profiles
WHERE profiles.id = p_user_id;

-- Check if user is admin
v_is_admin := v_user_role IN ('admin', 'owner');

RETURN QUERY
SELECT
a.id,
a.company_id,
a.project_id,
CASE
WHEN a.is_private AND NOT (a.created_by = p_user_id OR a.assigned_technician = p_user_id OR v_is_admin)
THEN NULL
ELSE a.contact_id
END as contact_id,
CASE
WHEN a.is_private AND NOT (a.created_by = p_user_id OR a.assigned_technician = p_user_id OR v_is_admin)
THEN 'Busy'
ELSE a.title
END as title,
CASE
WHEN a.is_private AND NOT (a.created_by = p_user_id OR a.assigned_technician = p_user_id OR v_is_admin)
THEN NULL
ELSE a.description
END as description,
a.appointment_date,
a.start_time,
a.end_time,
a.status,
CASE
WHEN a.is_private AND NOT (a.created_by = p_user_id OR a.assigned_technician = p_user_id OR v_is_admin)
THEN NULL
ELSE a.assigned_technician
END as assigned_technician,
CASE
WHEN a.is_private AND NOT (a.created_by = p_user_id OR a.assigned_technician = p_user_id OR v_is_admin)
THEN NULL
ELSE a.location
END as location,
CASE
WHEN a.is_private AND NOT (a.created_by = p_user_id OR a.assigned_technician = p_user_id OR v_is_admin)
THEN NULL
ELSE a.notes
END as notes,
a.created_by,
a.created_at,
a.updated_at,
CASE
WHEN a.is_private AND NOT (a.created_by = p_user_id OR a.assigned_technician = p_user_id OR v_is_admin)
THEN 'personal'::text
ELSE a.appointment_type
END as appointment_type,
a.is_private,
a.all_day,
-- is_blocked: true if user can't see details
(a.is_private AND NOT (a.created_by = p_user_id OR a.assigned_technician = p_user_id OR v_is_admin)) as is_blocked,
-- can_view_details: true if user can see full details
(NOT a.is_private OR a.created_by = p_user_id OR a.assigned_technician = p_user_id OR v_is_admin) as can_view_details
FROM appointments a
WHERE
a.organization_id = get_user_org_id()
AND (p_start_date IS NULL OR a.appointment_date >= p_start_date)
AND (p_end_date IS NULL OR a.appointment_date <= p_end_date)
ORDER BY a.appointment_date, a.start_time;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_appointments_with_privacy(uuid,uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_appointments_with_privacy(uuid,uuid,date,date) TO authenticated;

-- Notifications follow request authorization, not payroll approval, and never
-- select another tenant's settings or recipients.
CREATE OR REPLACE FUNCTION public.notify_approvers_of_time_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_ids uuid[];v_name text;v_label text;v_recipient uuid;
BEGIN
  IF NEW.status<>'pending_approval' THEN RETURN NEW; END IF;
  SELECT time_request_approver_ids INTO v_ids FROM company_settings WHERE organization_id=NEW.organization_id LIMIT 1;
  SELECT COALESCE(full_name,email,'A technician') INTO v_name FROM profiles WHERE id=NEW.assigned_to AND organization_id=NEW.organization_id;
  v_label:=CASE NEW.session_type WHEN 'shop_time' THEN 'Shop Time' WHEN 'training' THEN 'Training Time' ELSE initcap(replace(NEW.session_type,'_',' ')) END;
  FOR v_recipient IN SELECT id FROM profiles WHERE id=ANY(COALESCE(v_ids,ARRAY[]::uuid[]))
    AND organization_id=NEW.organization_id AND is_active IS DISTINCT FROM false
    AND role IN ('admin','manager','service_manager','office_manager','production_manager','sales_manager') LOOP
    INSERT INTO notifications(user_id,organization_id,type,title,body,related_id,is_read)
    VALUES(v_recipient,NEW.organization_id,'internal_time_request_submitted',v_name||' requested '||v_label,
      v_label||' request for '||COALESCE(NEW.predetermined_hours,0)||' hour(s)'||CASE WHEN COALESCE(NEW.request_reason,'')<>'' THEN ': '||NEW.request_reason ELSE '' END,NEW.id,false);
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_approvers_of_time_request() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.notify_tech_of_time_request_outcome()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_name text;v_label text;v_approved boolean;
BEGIN
  IF OLD.status<>'pending_approval' OR NEW.status NOT IN ('scheduled','denied') THEN RETURN NEW; END IF;
  IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=NEW.assigned_to AND organization_id=NEW.organization_id) THEN RETURN NEW; END IF;
  SELECT COALESCE(full_name,email,'A manager') INTO v_name FROM profiles WHERE id=COALESCE(NEW.approved_by,auth.uid()) AND organization_id=NEW.organization_id;
  v_name:=COALESCE(v_name,'A manager');v_approved:=NEW.status='scheduled';
  v_label:=CASE NEW.session_type WHEN 'shop_time' THEN 'Shop Time' WHEN 'training' THEN 'Training Time' ELSE initcap(replace(NEW.session_type,'_',' ')) END;
  INSERT INTO notifications(user_id,organization_id,type,title,body,related_id,is_read)
  VALUES(NEW.assigned_to,NEW.organization_id,CASE WHEN v_approved THEN 'internal_time_request_approved' ELSE 'internal_time_request_denied' END,
    v_label||CASE WHEN v_approved THEN ' request approved' ELSE ' request declined' END,
    v_name||CASE WHEN v_approved THEN ' approved your '||v_label||' request. The session is scheduled; record completed work before payroll review.'
      ELSE ' declined your '||v_label||' request.'||CASE WHEN COALESCE(NEW.denial_reason,'')<>'' THEN ' Reason: '||NEW.denial_reason ELSE '' END END,NEW.id,false);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_tech_of_time_request_outcome() FROM PUBLIC,anon,authenticated;

-- GPS may arrive after the clock timestamp. Evaluate the first coordinate update.
CREATE OR REPLACE FUNCTION public.check_home_clock_and_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
v_settings record;
v_profile record;
v_org_id uuid;
v_timezone text;
v_distance_in integer;
v_distance_out integer;
v_is_home_clock_in boolean := false;
v_is_home_clock_out boolean := false;
v_recipient record;
BEGIN
-- Get technician profile with home coordinates and org id
SELECT
id,
full_name,
home_latitude,
home_longitude,
home_address,
organization_id
INTO v_profile
FROM profiles
WHERE id = NEW.technician_id;

v_org_id := v_profile.organization_id;
SELECT COALESCE(timezone,'America/Chicago') INTO v_timezone FROM organizations WHERE id=v_org_id;

-- Get company settings for this org
SELECT
home_clock_notification_enabled,
home_location_radius_meters,
home_clock_notification_roles
INTO v_settings
FROM company_settings
WHERE organization_id = v_org_id
LIMIT 1;

-- Exit early if notifications are disabled
IF NOT COALESCE(v_settings.home_clock_notification_enabled, false) THEN
RETURN NEW;
END IF;

-- Check clock IN from home (only on INSERT or when clock_in changes)
IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.clock_in IS DISTINCT FROM NEW.clock_in
 OR OLD.clock_in_latitude IS DISTINCT FROM NEW.clock_in_latitude OR OLD.clock_in_longitude IS DISTINCT FROM NEW.clock_in_longitude)))
AND NOT COALESCE(NEW.clocked_in_from_home,false)
AND NEW.clock_in IS NOT NULL
AND NEW.clock_in_latitude IS NOT NULL
AND NEW.clock_in_longitude IS NOT NULL
AND v_profile.home_latitude IS NOT NULL
AND v_profile.home_longitude IS NOT NULL THEN

v_distance_in := calculate_distance_meters(
NEW.clock_in_latitude,
NEW.clock_in_longitude,
v_profile.home_latitude,
v_profile.home_longitude
);

IF v_distance_in IS NOT NULL AND v_distance_in <= COALESCE(v_settings.home_location_radius_meters, 150) THEN
v_is_home_clock_in := true;
NEW.clocked_in_from_home := true;
END IF;
END IF;

-- Check clock OUT from home (only when clock_out changes)
IF TG_OP = 'UPDATE'
AND (OLD.clock_out IS DISTINCT FROM NEW.clock_out OR OLD.clock_out_latitude IS DISTINCT FROM NEW.clock_out_latitude
 OR OLD.clock_out_longitude IS DISTINCT FROM NEW.clock_out_longitude)
AND NOT COALESCE(NEW.clocked_out_from_home,false)
AND NEW.clock_out IS NOT NULL
AND NEW.clock_out_latitude IS NOT NULL
AND NEW.clock_out_longitude IS NOT NULL
AND v_profile.home_latitude IS NOT NULL
AND v_profile.home_longitude IS NOT NULL THEN

v_distance_out := calculate_distance_meters(
NEW.clock_out_latitude,
NEW.clock_out_longitude,
v_profile.home_latitude,
v_profile.home_longitude
);

IF v_distance_out IS NOT NULL AND v_distance_out <= COALESCE(v_settings.home_location_radius_meters, 150) THEN
v_is_home_clock_out := true;
NEW.clocked_out_from_home := true;
END IF;
END IF;

-- Send notifications for clock-in from home
IF v_is_home_clock_in THEN
FOR v_recipient IN
SELECT id
FROM profiles
WHERE organization_id = v_org_id
AND is_active IS DISTINCT FROM false
AND role = ANY(COALESCE(
v_settings.home_clock_notification_roles,
ARRAY['admin', 'office_manager', 'production_manager', 'service_manager']
))
LOOP
INSERT INTO notifications (
user_id,
type,
title,
body,
related_id,
organization_id
) VALUES (
v_recipient.id,
'home_clock',
'Clock In From Home',
v_profile.full_name || ' clocked in from home at ' ||
TO_CHAR(NEW.clock_in AT TIME ZONE COALESCE(v_timezone,'America/Chicago'), 'HH12:MI AM') ||
CASE
WHEN v_distance_in IS NOT NULL THEN ' (' || v_distance_in || 'm from home)'
ELSE ''
END,
NEW.id,
v_org_id
);
END LOOP;
END IF;

-- Send notifications for clock-out from home
IF v_is_home_clock_out THEN
FOR v_recipient IN
SELECT id
FROM profiles
WHERE organization_id = v_org_id
AND is_active IS DISTINCT FROM false
AND role = ANY(COALESCE(
v_settings.home_clock_notification_roles,
ARRAY['admin', 'office_manager', 'production_manager', 'service_manager']
))
LOOP
INSERT INTO notifications (
user_id,
type,
title,
body,
related_id,
organization_id
) VALUES (
v_recipient.id,
'home_clock',
'Clock Out From Home',
v_profile.full_name || ' clocked out from home at ' ||
TO_CHAR(NEW.clock_out AT TIME ZONE COALESCE(v_timezone,'America/Chicago'), 'HH12:MI AM') ||
CASE
WHEN v_distance_out IS NOT NULL THEN ' (' || v_distance_out || 'm from home)'
ELSE ''
END,
NEW.id,
v_org_id
);
END LOOP;
END IF;

RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.check_home_clock_and_notify() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trigger_check_home_clock ON public.daily_clock_entries;
