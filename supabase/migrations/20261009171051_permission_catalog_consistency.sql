DO $mjv_rollout$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261002110037') THEN
  IF to_regclass('public.manual_job_time_requests') IS NOT NULL THEN RAISE EXCEPTION 'Unexpected partial time-authority deployment'; END IF;
  EXECUTE $mjv_time$-- Employee requests do not create payable hours. Review creates one canonical entry atomically.
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

-- Existing production policies permit inserts but omit recipient reads/acknowledgment.
-- Restore tenant-bound recipient access and limit client updates to read state.
GRANT SELECT,DELETE ON public.notifications TO authenticated;
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE(is_read) ON public.notifications TO authenticated;
DROP POLICY IF EXISTS notifications_recipient_read ON public.notifications;
CREATE POLICY notifications_recipient_read ON public.notifications FOR SELECT TO authenticated
USING (user_id=(SELECT auth.uid()) AND organization_id=get_user_org_id()
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.organization_id=notifications.organization_id AND p.is_active IS DISTINCT FROM false));
DROP POLICY IF EXISTS notifications_recipient_ack ON public.notifications;
CREATE POLICY notifications_recipient_ack ON public.notifications FOR UPDATE TO authenticated
USING (user_id=(SELECT auth.uid()) AND organization_id=get_user_org_id()
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.organization_id=notifications.organization_id AND p.is_active IS DISTINCT FROM false))
WITH CHECK (user_id=(SELECT auth.uid()) AND organization_id=get_user_org_id()
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.organization_id=notifications.organization_id AND p.is_active IS DISTINCT FROM false));
DROP POLICY IF EXISTS notifications_recipient_delete ON public.notifications;
CREATE POLICY notifications_recipient_delete ON public.notifications FOR DELETE TO authenticated
USING (user_id=(SELECT auth.uid()) AND organization_id=get_user_org_id()
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.organization_id=notifications.organization_id AND p.is_active IS DISTINCT FROM false));
$mjv_time$;
  INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261002110037','enforce_employee_time_authority',ARRAY[$mjv_time$-- Employee requests do not create payable hours. Review creates one canonical entry atomically.
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

-- Existing production policies permit inserts but omit recipient reads/acknowledgment.
-- Restore tenant-bound recipient access and limit client updates to read state.
GRANT SELECT,DELETE ON public.notifications TO authenticated;
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE(is_read) ON public.notifications TO authenticated;
DROP POLICY IF EXISTS notifications_recipient_read ON public.notifications;
CREATE POLICY notifications_recipient_read ON public.notifications FOR SELECT TO authenticated
USING (user_id=(SELECT auth.uid()) AND organization_id=get_user_org_id()
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.organization_id=notifications.organization_id AND p.is_active IS DISTINCT FROM false));
DROP POLICY IF EXISTS notifications_recipient_ack ON public.notifications;
CREATE POLICY notifications_recipient_ack ON public.notifications FOR UPDATE TO authenticated
USING (user_id=(SELECT auth.uid()) AND organization_id=get_user_org_id()
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.organization_id=notifications.organization_id AND p.is_active IS DISTINCT FROM false))
WITH CHECK (user_id=(SELECT auth.uid()) AND organization_id=get_user_org_id()
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.organization_id=notifications.organization_id AND p.is_active IS DISTINCT FROM false));
DROP POLICY IF EXISTS notifications_recipient_delete ON public.notifications;
CREATE POLICY notifications_recipient_delete ON public.notifications FOR DELETE TO authenticated
USING (user_id=(SELECT auth.uid()) AND organization_id=get_user_org_id()
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.organization_id=notifications.organization_id AND p.is_active IS DISTINCT FROM false));
$mjv_time$]);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261005131500') THEN
  IF to_regprocedure('public.complete_task_atomic(uuid)') IS NOT NULL THEN RAISE EXCEPTION 'Unexpected partial task deployment'; END IF;
  EXECUTE $mjv_task$/*
  # Department task assignment and atomic completion

  Adds three assignment scopes to regular Tasks:
  - Anyone (assigned_to and assigned_department_id are null)
  - Department (assigned_department_id)
  - Person (assigned_to)

  Department membership reuses MJV's existing role_department_access and
  department_user_overrides model. Department members are notified on assignment.

  complete_task_atomic() locks the task row, validates eligibility, completes it,
  records the completing user, awards points once, and notifies the creator/watchers
  in one transaction. This prevents two users from earning points for the same task.
*/

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS assigned_department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 10;

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_department_id
  ON public.tasks(assigned_department_id);

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_single_assignment_target;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_single_assignment_target
  CHECK (NOT (assigned_to IS NOT NULL AND assigned_department_id IS NOT NULL));

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.user_has_department_access(
  p_user_id uuid,
  p_department_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL OR p_department_id IS NULL THEN false
    WHEN EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = p_user_id
        AND COALESCE(p.is_active, true) = true
        AND p.role = 'admin'
    ) THEN true
    WHEN EXISTS (
      SELECT 1
      FROM department_user_overrides duo
      WHERE duo.user_id = p_user_id
        AND duo.department_id = p_department_id
        AND duo.has_access = true
    ) THEN true
    WHEN EXISTS (
      SELECT 1
      FROM profiles p
      JOIN role_department_access rda
        ON rda.role_id = p.role_id
       AND rda.department_id = p_department_id
       AND rda.has_access = true
      WHERE p.id = p_user_id
        AND COALESCE(p.is_active, true) = true
      AND NOT EXISTS (
        SELECT 1
        FROM department_user_overrides deny_override
        WHERE deny_override.user_id = p_user_id
          AND deny_override.department_id = p_department_id
          AND deny_override.has_access = false
      )
    ) THEN true
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION private.user_has_department_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.user_has_department_access(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_task_department_ids()
RETURNS TABLE(department_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$
  SELECT d.id
  FROM departments d
  WHERE d.is_active = true
    AND private.user_has_department_access(auth.uid(), d.id);
$$;

REVOKE ALL ON FUNCTION public.get_my_task_department_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_task_department_ids() TO authenticated;

DROP POLICY IF EXISTS "Internal users can view open team tasks" ON public.tasks;
CREATE POLICY "Internal users can view open team tasks"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (
    assigned_to IS NULL
    AND assigned_department_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true) = true
        AND COALESCE(p.role, '') <> 'portal_user'
    )
  );

DROP POLICY IF EXISTS "Department members can view department tasks" ON public.tasks;
CREATE POLICY "Department members can view department tasks"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (
    assigned_department_id IS NOT NULL
    AND private.user_has_department_access(auth.uid(), assigned_department_id)
  );

CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_name text;
  v_body text;
  v_department_name text;
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    SELECT COALESCE(full_name, company_name)
      INTO v_customer_name
    FROM contacts
    WHERE id = NEW.contact_id;
  END IF;

  v_body := CASE
    WHEN NULLIF(v_customer_name, '') IS NOT NULL
      THEN NEW.title || ' — ' || v_customer_name
    ELSE NEW.title
  END;

  -- Person assignment: notify only that employee.
  IF NEW.assigned_to IS NOT NULL
     AND (
       TG_OP = 'INSERT'
       OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to
       OR OLD.assigned_department_id IS DISTINCT FROM NEW.assigned_department_id
     ) THEN
    INSERT INTO notifications (user_id, title, body, type, is_read, related_id, created_at)
    VALUES (NEW.assigned_to, 'Task Assigned to You', v_body, 'task_assigned', false, NEW.id, now());
  END IF;

  -- Department assignment: notify every active member once when the task enters/moves departments.
  IF NEW.assigned_department_id IS NOT NULL
     AND (
       TG_OP = 'INSERT'
       OR OLD.assigned_department_id IS DISTINCT FROM NEW.assigned_department_id
       OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to
     ) THEN
    SELECT display_name INTO v_department_name
    FROM departments
    WHERE id = NEW.assigned_department_id;

    INSERT INTO notifications (user_id, title, body, type, is_read, related_id, created_at)
    SELECT p.id,
           COALESCE(v_department_name, 'Department') || ' Task Assigned',
           v_body,
           'task_assigned',
           false,
           NEW.id,
           now()
    FROM profiles p
    WHERE COALESCE(p.is_active, true) = true
      AND private.user_has_department_access(p.id, NEW.assigned_department_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_task_assigned ON public.tasks;
CREATE TRIGGER trigger_notify_task_assigned
  AFTER INSERT OR UPDATE OF assigned_to, assigned_department_id ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_task_assigned();

-- Completion notifications are handled by complete_task_atomic so the actor never
-- receives a redundant "you just completed this" status notification.
DROP TRIGGER IF EXISTS trigger_notify_task_status_changed ON public.tasks;

CREATE OR REPLACE FUNCTION public.complete_task_atomic(p_task_id uuid)
RETURNS TABLE (
  task_id uuid,
  completed_by uuid,
  points_awarded integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task tasks%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_points integer := 0;
  v_completer_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_task
  FROM tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  IF v_task.status = 'completed' THEN
    RAISE EXCEPTION 'Task was already completed';
  END IF;

  SELECT (role = 'admin') INTO v_is_admin
  FROM profiles
  WHERE id = v_user_id;

  IF v_task.assigned_to IS NOT NULL THEN
    IF v_task.assigned_to <> v_user_id
       AND v_task.user_id <> v_user_id
       AND NOT COALESCE(v_is_admin, false) THEN
      RAISE EXCEPTION 'This task is assigned to another user';
    END IF;
  ELSIF v_task.assigned_department_id IS NOT NULL THEN
    IF NOT private.user_has_department_access(v_user_id, v_task.assigned_department_id)
       AND v_task.user_id <> v_user_id
       AND NOT COALESCE(v_is_admin, false) THEN
      RAISE EXCEPTION 'You do not have access to this department task';
    END IF;
  END IF;

  v_points := COALESCE(v_task.points, 0);

  UPDATE tasks
  SET status = 'completed',
      completed_at = now(),
      completed_by = v_user_id,
      claimed_by = v_user_id
  WHERE id = p_task_id;

  IF v_points > 0 THEN
    INSERT INTO points_transactions (
      user_id, points_amount, transaction_type, reference_id, description
    )
    VALUES (
      v_user_id,
      v_points,
      'task_completion',
      p_task_id,
      'Completed task: ' || v_task.title
    );
  END IF;

  SELECT COALESCE(full_name, 'Team member')
    INTO v_completer_name
  FROM profiles
  WHERE id = v_user_id;

  INSERT INTO notifications (user_id, title, body, type, is_read, related_id, created_at)
  SELECT recipients.user_id,
         'Task Completed',
         v_task.title || ' — completed by ' || COALESCE(v_completer_name, 'Team member'),
         'task',
         false,
         p_task_id,
         now()
  FROM (
    SELECT v_task.user_id AS user_id
    UNION
    SELECT tw.user_id
    FROM task_watchers tw
    WHERE tw.task_id = p_task_id
  ) recipients
  WHERE recipients.user_id IS NOT NULL
    AND recipients.user_id <> v_user_id;

  RETURN QUERY SELECT p_task_id, v_user_id, v_points;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_task_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_task_atomic(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reopen_task_atomic(p_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task tasks%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
BEGIN
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;

  SELECT (role = 'admin') INTO v_is_admin FROM profiles WHERE id = v_user_id;

  IF v_task.user_id <> v_user_id AND NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Only the task creator or an admin can reopen this task';
  END IF;

  IF v_task.status <> 'completed' THEN RETURN; END IF;

  IF v_task.completed_by IS NOT NULL AND COALESCE(v_task.points, 0) > 0 THEN
    INSERT INTO points_transactions (
      user_id, points_amount, transaction_type, reference_id, description
    )
    VALUES (
      v_task.completed_by,
      -COALESCE(v_task.points, 0),
      'admin_adjustment',
      p_task_id,
      'Points reversed — task reopened: ' || v_task.title
    );
  END IF;

  UPDATE tasks
  SET status = 'pending',
      completed_at = null,
      completed_by = null,
      claimed_by = null
  WHERE id = p_task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_task_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_task_atomic(uuid) TO authenticated;


-- Force completion through the atomic RPC so points/claiming cannot be bypassed
-- by a direct client-side status update.
CREATE OR REPLACE FUNCTION public.enforce_atomic_task_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'completed'
     AND NEW.status = 'completed'
     AND NEW.completed_by IS NULL THEN
    RAISE EXCEPTION 'Use complete_task_atomic() to complete tasks';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_atomic_task_completion ON public.tasks;
CREATE TRIGGER trigger_enforce_atomic_task_completion
  BEFORE UPDATE OF status ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_atomic_task_completion();


-- Trigger functions do not need to be callable through the Data API.
REVOKE ALL ON FUNCTION public.notify_task_assigned() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_atomic_task_completion() FROM PUBLIC, anon, authenticated;
$mjv_task$;
  INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261005131500','task_department_assignment_and_atomic_completion',ARRAY[$mjv_task$/*
  # Department task assignment and atomic completion

  Adds three assignment scopes to regular Tasks:
  - Anyone (assigned_to and assigned_department_id are null)
  - Department (assigned_department_id)
  - Person (assigned_to)

  Department membership reuses MJV's existing role_department_access and
  department_user_overrides model. Department members are notified on assignment.

  complete_task_atomic() locks the task row, validates eligibility, completes it,
  records the completing user, awards points once, and notifies the creator/watchers
  in one transaction. This prevents two users from earning points for the same task.
*/

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS assigned_department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 10;

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_department_id
  ON public.tasks(assigned_department_id);

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_single_assignment_target;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_single_assignment_target
  CHECK (NOT (assigned_to IS NOT NULL AND assigned_department_id IS NOT NULL));

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.user_has_department_access(
  p_user_id uuid,
  p_department_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL OR p_department_id IS NULL THEN false
    WHEN EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = p_user_id
        AND COALESCE(p.is_active, true) = true
        AND p.role = 'admin'
    ) THEN true
    WHEN EXISTS (
      SELECT 1
      FROM department_user_overrides duo
      WHERE duo.user_id = p_user_id
        AND duo.department_id = p_department_id
        AND duo.has_access = true
    ) THEN true
    WHEN EXISTS (
      SELECT 1
      FROM profiles p
      JOIN role_department_access rda
        ON rda.role_id = p.role_id
       AND rda.department_id = p_department_id
       AND rda.has_access = true
      WHERE p.id = p_user_id
        AND COALESCE(p.is_active, true) = true
      AND NOT EXISTS (
        SELECT 1
        FROM department_user_overrides deny_override
        WHERE deny_override.user_id = p_user_id
          AND deny_override.department_id = p_department_id
          AND deny_override.has_access = false
      )
    ) THEN true
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION private.user_has_department_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.user_has_department_access(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_task_department_ids()
RETURNS TABLE(department_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$
  SELECT d.id
  FROM departments d
  WHERE d.is_active = true
    AND private.user_has_department_access(auth.uid(), d.id);
$$;

REVOKE ALL ON FUNCTION public.get_my_task_department_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_task_department_ids() TO authenticated;

DROP POLICY IF EXISTS "Internal users can view open team tasks" ON public.tasks;
CREATE POLICY "Internal users can view open team tasks"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (
    assigned_to IS NULL
    AND assigned_department_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true) = true
        AND COALESCE(p.role, '') <> 'portal_user'
    )
  );

DROP POLICY IF EXISTS "Department members can view department tasks" ON public.tasks;
CREATE POLICY "Department members can view department tasks"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (
    assigned_department_id IS NOT NULL
    AND private.user_has_department_access(auth.uid(), assigned_department_id)
  );

CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_name text;
  v_body text;
  v_department_name text;
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    SELECT COALESCE(full_name, company_name)
      INTO v_customer_name
    FROM contacts
    WHERE id = NEW.contact_id;
  END IF;

  v_body := CASE
    WHEN NULLIF(v_customer_name, '') IS NOT NULL
      THEN NEW.title || ' — ' || v_customer_name
    ELSE NEW.title
  END;

  -- Person assignment: notify only that employee.
  IF NEW.assigned_to IS NOT NULL
     AND (
       TG_OP = 'INSERT'
       OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to
       OR OLD.assigned_department_id IS DISTINCT FROM NEW.assigned_department_id
     ) THEN
    INSERT INTO notifications (user_id, title, body, type, is_read, related_id, created_at)
    VALUES (NEW.assigned_to, 'Task Assigned to You', v_body, 'task_assigned', false, NEW.id, now());
  END IF;

  -- Department assignment: notify every active member once when the task enters/moves departments.
  IF NEW.assigned_department_id IS NOT NULL
     AND (
       TG_OP = 'INSERT'
       OR OLD.assigned_department_id IS DISTINCT FROM NEW.assigned_department_id
       OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to
     ) THEN
    SELECT display_name INTO v_department_name
    FROM departments
    WHERE id = NEW.assigned_department_id;

    INSERT INTO notifications (user_id, title, body, type, is_read, related_id, created_at)
    SELECT p.id,
           COALESCE(v_department_name, 'Department') || ' Task Assigned',
           v_body,
           'task_assigned',
           false,
           NEW.id,
           now()
    FROM profiles p
    WHERE COALESCE(p.is_active, true) = true
      AND private.user_has_department_access(p.id, NEW.assigned_department_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_task_assigned ON public.tasks;
CREATE TRIGGER trigger_notify_task_assigned
  AFTER INSERT OR UPDATE OF assigned_to, assigned_department_id ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_task_assigned();

-- Completion notifications are handled by complete_task_atomic so the actor never
-- receives a redundant "you just completed this" status notification.
DROP TRIGGER IF EXISTS trigger_notify_task_status_changed ON public.tasks;

CREATE OR REPLACE FUNCTION public.complete_task_atomic(p_task_id uuid)
RETURNS TABLE (
  task_id uuid,
  completed_by uuid,
  points_awarded integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task tasks%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_points integer := 0;
  v_completer_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_task
  FROM tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  IF v_task.status = 'completed' THEN
    RAISE EXCEPTION 'Task was already completed';
  END IF;

  SELECT (role = 'admin') INTO v_is_admin
  FROM profiles
  WHERE id = v_user_id;

  IF v_task.assigned_to IS NOT NULL THEN
    IF v_task.assigned_to <> v_user_id
       AND v_task.user_id <> v_user_id
       AND NOT COALESCE(v_is_admin, false) THEN
      RAISE EXCEPTION 'This task is assigned to another user';
    END IF;
  ELSIF v_task.assigned_department_id IS NOT NULL THEN
    IF NOT private.user_has_department_access(v_user_id, v_task.assigned_department_id)
       AND v_task.user_id <> v_user_id
       AND NOT COALESCE(v_is_admin, false) THEN
      RAISE EXCEPTION 'You do not have access to this department task';
    END IF;
  END IF;

  v_points := COALESCE(v_task.points, 0);

  UPDATE tasks
  SET status = 'completed',
      completed_at = now(),
      completed_by = v_user_id,
      claimed_by = v_user_id
  WHERE id = p_task_id;

  IF v_points > 0 THEN
    INSERT INTO points_transactions (
      user_id, points_amount, transaction_type, reference_id, description
    )
    VALUES (
      v_user_id,
      v_points,
      'task_completion',
      p_task_id,
      'Completed task: ' || v_task.title
    );
  END IF;

  SELECT COALESCE(full_name, 'Team member')
    INTO v_completer_name
  FROM profiles
  WHERE id = v_user_id;

  INSERT INTO notifications (user_id, title, body, type, is_read, related_id, created_at)
  SELECT recipients.user_id,
         'Task Completed',
         v_task.title || ' — completed by ' || COALESCE(v_completer_name, 'Team member'),
         'task',
         false,
         p_task_id,
         now()
  FROM (
    SELECT v_task.user_id AS user_id
    UNION
    SELECT tw.user_id
    FROM task_watchers tw
    WHERE tw.task_id = p_task_id
  ) recipients
  WHERE recipients.user_id IS NOT NULL
    AND recipients.user_id <> v_user_id;

  RETURN QUERY SELECT p_task_id, v_user_id, v_points;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_task_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_task_atomic(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reopen_task_atomic(p_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task tasks%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
BEGIN
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;

  SELECT (role = 'admin') INTO v_is_admin FROM profiles WHERE id = v_user_id;

  IF v_task.user_id <> v_user_id AND NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Only the task creator or an admin can reopen this task';
  END IF;

  IF v_task.status <> 'completed' THEN RETURN; END IF;

  IF v_task.completed_by IS NOT NULL AND COALESCE(v_task.points, 0) > 0 THEN
    INSERT INTO points_transactions (
      user_id, points_amount, transaction_type, reference_id, description
    )
    VALUES (
      v_task.completed_by,
      -COALESCE(v_task.points, 0),
      'admin_adjustment',
      p_task_id,
      'Points reversed — task reopened: ' || v_task.title
    );
  END IF;

  UPDATE tasks
  SET status = 'pending',
      completed_at = null,
      completed_by = null,
      claimed_by = null
  WHERE id = p_task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_task_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_task_atomic(uuid) TO authenticated;


-- Force completion through the atomic RPC so points/claiming cannot be bypassed
-- by a direct client-side status update.
CREATE OR REPLACE FUNCTION public.enforce_atomic_task_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'completed'
     AND NEW.status = 'completed'
     AND NEW.completed_by IS NULL THEN
    RAISE EXCEPTION 'Use complete_task_atomic() to complete tasks';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_atomic_task_completion ON public.tasks;
CREATE TRIGGER trigger_enforce_atomic_task_completion
  BEFORE UPDATE OF status ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_atomic_task_completion();


-- Trigger functions do not need to be callable through the Data API.
REVOKE ALL ON FUNCTION public.notify_task_assigned() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_atomic_task_completion() FROM PUBLIC, anon, authenticated;
$mjv_task$]);
 END IF;
 EXECUTE $mjv_cleanup$-- Preserve historical menu IDs and existing user exceptions. Permission saves are
-- transactional, tenant-scoped, and guarded by a revision rather than delete/insert.
CREATE SCHEMA IF NOT EXISTS private;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS permission_revision bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION private.is_current_page_key(p_key text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT p_key IS NOT NULL AND p_key <> ALL(ARRAY[
 'preferences','by_office','proposal_messages_admin','company_settings',
 'user_management','role_permissions','menu_builder','offices','priority_management',
 'pay_types','integrations','department_access','unassigned_jobs','payments',
 'job_costing','reports','quickbooks','feature_suggestions']);
$$;

CREATE OR REPLACE FUNCTION private.permission_admin_for_org(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
 AND p.organization_id=p_org AND p.is_active=true
 AND (p.role='admin' OR p.is_global_admin=true));
$$;

-- The old helper treated all managers as administrators, including privilege edits.
CREATE OR REPLACE FUNCTION public.caller_is_admin_profile()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
 AND p.is_active=true AND (p.role='admin' OR p.is_global_admin=true));
$$;
REVOKE ALL ON FUNCTION public.caller_is_admin_profile() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.caller_is_admin_profile() TO authenticated;

CREATE OR REPLACE FUNCTION private.guard_permission_metadata()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_old jsonb; v_new jsonb; v_org uuid; v_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN
   IF current_setting('role',true) IN ('anon','authenticated')
      OR coalesce(current_setting('request.jwt.claim.role',true),'') IN ('anon','authenticated') THEN
     RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
   END IF;
   IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 v_old:=to_jsonb(OLD); v_new:=to_jsonb(NEW);
 v_org:=coalesce((v_new->>'organization_id')::uuid,(v_old->>'organization_id')::uuid);
 IF NOT private.permission_admin_for_org(v_org) THEN
   RAISE EXCEPTION 'Only an active administrator can change permissions in this organization' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND v_old->>'organization_id' IS DISTINCT FROM v_new->>'organization_id' THEN
   RAISE EXCEPTION 'Permission records cannot move between organizations' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='roles' THEN
   IF TG_OP='DELETE' AND (OLD.is_system_role OR EXISTS(SELECT 1 FROM public.profiles WHERE role_id=OLD.id)) THEN
     RAISE EXCEPTION 'System roles and roles assigned to users cannot be deleted' USING ERRCODE='23503';
   END IF;
   IF TG_OP='UPDATE' AND OLD.is_system_role AND
     (OLD.role_key IS DISTINCT FROM NEW.role_key OR OLD.is_system_role IS DISTINCT FROM NEW.is_system_role OR NOT NEW.is_active) THEN
     RAISE EXCEPTION 'System role identity and availability cannot change' USING ERRCODE='42501';
   END IF;
 END IF;
 IF TG_OP<>'DELETE' THEN
   IF v_new ? 'role_id' AND NOT EXISTS(SELECT 1 FROM public.roles WHERE id=(v_new->>'role_id')::uuid AND organization_id=v_org) THEN
     RAISE EXCEPTION 'Role is outside this organization' USING ERRCODE='42501';
   END IF;
   IF v_new ? 'module_id' AND NOT EXISTS(SELECT 1 FROM public.department_modules WHERE id=(v_new->>'module_id')::uuid AND organization_id=v_org) THEN
     RAISE EXCEPTION 'Page is outside this organization' USING ERRCODE='42501';
   END IF;
   IF v_new ? 'department_id' AND NOT EXISTS(SELECT 1 FROM public.departments WHERE id=(v_new->>'department_id')::uuid AND organization_id=v_org) THEN
     RAISE EXCEPTION 'Department is outside this organization' USING ERRCODE='42501';
   END IF;
   IF v_new ? 'user_id' AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=(v_new->>'user_id')::uuid AND organization_id=v_org) THEN
     RAISE EXCEPTION 'User is outside this organization' USING ERRCODE='42501';
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['roles','departments','department_modules','role_department_access','role_module_access','user_permission_overrides','department_user_overrides'] LOOP
   EXECUTE format('DROP TRIGGER IF EXISTS guard_permission_metadata ON public.%I',t);
   EXECUTE format('CREATE TRIGGER guard_permission_metadata BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.guard_permission_metadata()',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION private.bump_permission_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN UPDATE public.roles SET permission_revision=permission_revision+1 WHERE id=OLD.role_id; END IF;
 IF TG_OP='INSERT' OR (TG_OP='UPDATE' AND OLD.role_id IS DISTINCT FROM NEW.role_id) THEN
   UPDATE public.roles SET permission_revision=permission_revision+1 WHERE id=NEW.role_id;
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS bump_permission_revision ON public.role_module_access;
CREATE TRIGGER bump_permission_revision AFTER INSERT OR UPDATE OR DELETE ON public.role_module_access
 FOR EACH ROW EXECUTE FUNCTION private.bump_permission_revision();

CREATE OR REPLACE FUNCTION public.get_role_page_permissions(p_role_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_role public.roles;
BEGIN
 SELECT * INTO v_role FROM public.roles WHERE id=p_role_id;
 IF NOT FOUND OR NOT private.permission_admin_for_org(v_role.organization_id) THEN
   RAISE EXCEPTION 'Administrator access required for this role' USING ERRCODE='42501';
 END IF;
 RETURN jsonb_build_object('revision',v_role.permission_revision,'modules',coalesce((SELECT jsonb_agg(jsonb_build_object('module_id',a.module_id,'has_access',a.has_access)) FROM public.role_module_access a WHERE a.role_id=p_role_id AND a.organization_id=v_role.organization_id),'[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.save_role_page_permissions(p_role_id uuid,p_expected_revision bigint,p_permissions jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_role public.roles; item jsonb;
BEGIN
 SELECT * INTO v_role FROM public.roles WHERE id=p_role_id FOR UPDATE;
 IF NOT FOUND OR NOT private.permission_admin_for_org(v_role.organization_id) THEN
   RAISE EXCEPTION 'Administrator access required for this role' USING ERRCODE='42501';
 END IF;
 IF v_role.role_key='admin' THEN RAISE EXCEPTION 'Administrator access is inherent; assign a limited role to restrict a user' USING ERRCODE='42501'; END IF;
 IF p_expected_revision IS NULL OR v_role.permission_revision<>p_expected_revision THEN
   RAISE EXCEPTION 'Permissions changed in another session. Reload this role before saving' USING ERRCODE='40001';
 END IF;
 IF p_permissions IS NULL OR jsonb_typeof(p_permissions)<>'array' OR jsonb_array_length(p_permissions)>500 THEN
   RAISE EXCEPTION 'Invalid permission list' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_permissions) x GROUP BY x->>'module_key' HAVING count(*)>1) THEN
   RAISE EXCEPTION 'Duplicate page permissions' USING ERRCODE='22023';
 END IF;
 -- Validate the entire request before changing anything. Legacy rows are untouched.
 FOR item IN SELECT * FROM jsonb_array_elements(p_permissions) LOOP
   IF jsonb_typeof(item->'has_access') IS DISTINCT FROM 'boolean' OR item->>'module_key' IN ('settings','feature_suggestions') OR NOT EXISTS(
     SELECT 1 FROM public.department_modules m JOIN public.departments d ON d.id=m.department_id
     WHERE m.organization_id=v_role.organization_id AND d.organization_id=v_role.organization_id
     AND m.is_active AND d.is_active AND m.module_key=item->>'module_key' AND private.is_current_page_key(m.module_key)) THEN
     RAISE EXCEPTION 'This page is inactive, unavailable or controlled by the system' USING ERRCODE='22023';
   END IF;
 END LOOP;
 INSERT INTO public.role_module_access(role_id,module_id,has_access,organization_id)
 SELECT p_role_id,m.id,(permissions.value->>'has_access')::boolean,v_role.organization_id
 FROM jsonb_array_elements(p_permissions) permissions(value) JOIN public.department_modules m ON m.module_key=permissions.value->>'module_key'
 WHERE m.organization_id=v_role.organization_id AND m.is_active
 ON CONFLICT(role_id,module_id) DO UPDATE SET has_access=excluded.has_access;
 -- Department access is a summary for existing consumers, not a second page gate.
 INSERT INTO public.role_department_access(role_id,department_id,has_access,organization_id)
 SELECT p_role_id,d.id,EXISTS(SELECT 1 FROM public.department_modules m JOIN public.role_module_access a ON a.module_id=m.id AND a.role_id=p_role_id
 WHERE m.department_id=d.id AND m.is_active AND private.is_current_page_key(m.module_key) AND a.has_access),v_role.organization_id
 FROM public.departments d WHERE d.organization_id=v_role.organization_id AND d.is_active
 ON CONFLICT(role_id,department_id) DO UPDATE SET has_access=excluded.has_access;
 RETURN public.get_role_page_permissions(p_role_id);
END $$;

CREATE OR REPLACE FUNCTION public.set_user_page_permissions(p_user_id uuid,p_module_keys text[],p_has_access boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target public.profiles; k text;
BEGIN
 SELECT * INTO target FROM public.profiles WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND OR NOT private.permission_admin_for_org(target.organization_id) THEN
   RAISE EXCEPTION 'Administrator access required for this user' USING ERRCODE='42501';
 END IF;
 IF target.role='admin' THEN RAISE EXCEPTION 'Assign a limited role to restrict administrator access' USING ERRCODE='42501'; END IF;
 IF p_module_keys IS NULL OR cardinality(p_module_keys)=0 OR cardinality(p_module_keys)>500 THEN
   RAISE EXCEPTION 'Choose at least one current page' USING ERRCODE='22023';
 END IF;
 FOREACH k IN ARRAY p_module_keys LOOP
   IF k IN ('settings','feature_suggestions') OR (k='my_time_off' AND target.employment_classification IS DISTINCT FROM 'employee') OR NOT EXISTS(
     SELECT 1 FROM public.department_modules m JOIN public.departments d ON d.id=m.department_id
     WHERE m.organization_id=target.organization_id AND d.organization_id=target.organization_id AND m.module_key=k AND m.is_active AND d.is_active AND private.is_current_page_key(k)) THEN
     RAISE EXCEPTION 'This page is unavailable for this user' USING ERRCODE='22023';
   END IF;
 END LOOP;
 IF p_has_access IS NULL THEN
   DELETE FROM public.user_permission_overrides a USING public.department_modules m
   WHERE a.user_id=p_user_id AND a.organization_id=target.organization_id AND a.module_id=m.id AND m.module_key=ANY(p_module_keys);
 ELSE
   INSERT INTO public.user_permission_overrides(user_id,module_id,override_type,organization_id,created_by)
   SELECT p_user_id,m.id,CASE WHEN p_has_access THEN 'grant' ELSE 'revoke' END,target.organization_id,auth.uid()
   FROM public.department_modules m WHERE m.organization_id=target.organization_id AND m.is_active AND m.module_key=ANY(p_module_keys)
   ON CONFLICT(user_id,module_id) DO UPDATE SET override_type=excluded.override_type;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.get_role_page_permissions(uuid),public.save_role_page_permissions(uuid,bigint,jsonb),public.set_user_page_permissions(uuid,text[],boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_role_page_permissions(uuid),public.save_role_page_permissions(uuid,bigint,jsonb),public.set_user_page_permissions(uuid,text[],boolean) TO authenticated;

CREATE OR REPLACE FUNCTION private.can_access_page(p_user_id uuid,p_key text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.profiles;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE id=p_user_id AND is_active=true;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_key IN ('preferences','feature_suggestions') THEN RETURN true; END IF;
 IF p_key='settings' THEN RETURN p.role='admin'; END IF;
 IF p_key='my_time_off' AND p.employment_classification IS DISTINCT FROM 'employee' THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.department_modules m JOIN public.departments d ON d.id=m.department_id
   WHERE m.organization_id=p.organization_id AND d.organization_id=p.organization_id AND m.module_key=p_key AND m.is_active AND d.is_active AND private.is_current_page_key(p_key)) THEN RETURN false; END IF;
 IF p.role='admin' THEN RETURN true; END IF;
 IF EXISTS(SELECT 1 FROM public.user_permission_overrides u JOIN public.department_modules m ON m.id=u.module_id
   WHERE u.user_id=p.id AND u.organization_id=p.organization_id AND m.organization_id=p.organization_id AND m.module_key=p_key AND m.is_active AND u.override_type='revoke') THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.user_permission_overrides u JOIN public.department_modules m ON m.id=u.module_id
   WHERE u.user_id=p.id AND u.organization_id=p.organization_id AND m.organization_id=p.organization_id AND m.module_key=p_key AND m.is_active AND u.override_type='grant') THEN RETURN true; END IF;
 RETURN EXISTS(SELECT 1 FROM public.role_module_access a JOIN public.department_modules m ON m.id=a.module_id JOIN public.roles r ON r.id=a.role_id
   WHERE a.role_id=p.role_id AND r.is_active AND r.organization_id=p.organization_id AND a.organization_id=p.organization_id AND m.organization_id=p.organization_id AND m.module_key=p_key AND m.is_active AND a.has_access);
END $$;
REVOKE ALL ON FUNCTION private.can_access_page(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.guard_product_permission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_org uuid;
BEGIN
 IF TG_OP='DELETE' THEN v_org:=OLD.organization_id; ELSE v_org:=NEW.organization_id; END IF;
 IF auth.uid() IS NULL THEN
   IF current_setting('role',true) IN ('anon','authenticated') OR coalesce(current_setting('request.jwt.claim.role',true),'') IN ('anon','authenticated') THEN
     RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
   END IF;
 ELSIF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=v_org AND p.is_active AND (p.role='admin' OR p.can_edit_products=true))
   OR (TG_OP='UPDATE' AND OLD.organization_id IS DISTINCT FROM NEW.organization_id) THEN
   RAISE EXCEPTION 'Product editing permission required for this organization' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
DROP TRIGGER IF EXISTS guard_product_permission ON public.products;
CREATE TRIGGER guard_product_permission BEFORE INSERT OR UPDATE OR DELETE ON public.products
 FOR EACH ROW EXECUTE FUNCTION private.guard_product_permission();

-- Keep a private, non-API snapshot so role-default changes can be reviewed/reverted.
CREATE TABLE IF NOT EXISTS private.permission_cleanup_backup(
 migration text NOT NULL,entity text NOT NULL,entity_id uuid NOT NULL,previous_value jsonb NOT NULL,
 PRIMARY KEY(migration,entity,entity_id));
REVOKE ALL ON private.permission_cleanup_backup FROM PUBLIC,anon,authenticated;
INSERT INTO private.permission_cleanup_backup
 SELECT 'permission_catalog_consistency','department_modules',id,to_jsonb(m) FROM public.department_modules m
 WHERE NOT private.is_current_page_key(m.module_key)
 ON CONFLICT DO NOTHING;
INSERT INTO private.permission_cleanup_backup
 SELECT 'permission_catalog_consistency','role_module_access',id,to_jsonb(a) FROM public.role_module_access a ON CONFLICT DO NOTHING;
INSERT INTO private.permission_cleanup_backup
 SELECT 'permission_catalog_consistency','user_permission_overrides',id,to_jsonb(o) FROM public.user_permission_overrides o ON CONFLICT DO NOTHING;
INSERT INTO private.permission_cleanup_backup
 SELECT 'permission_catalog_consistency','profiles',id,to_jsonb(p) FROM public.profiles p
 WHERE p.role IN ('sales','tech','finance','service_manager') ON CONFLICT DO NOTHING;

UPDATE public.department_modules SET is_active=false WHERE NOT private.is_current_page_key(module_key);
UPDATE public.department_modules SET display_name='Feedback' WHERE module_key='reviews';
UPDATE public.department_modules SET display_name='Flow: Customer Messages' WHERE module_key='messages';

-- Normalize role grants across invoice shortcuts; explicit individual revokes
-- already take precedence and are not changed by this migration.
WITH grants AS (
 SELECT a.role_id,bool_or(a.has_access) AS allowed FROM public.role_module_access a JOIN public.department_modules m ON m.id=a.module_id
 WHERE m.module_key='invoices' GROUP BY a.role_id
)
INSERT INTO public.role_module_access(role_id,module_id,has_access,organization_id)
 SELECT r.id,m.id,g.allowed,r.organization_id FROM grants g JOIN public.roles r ON r.id=g.role_id
 JOIN public.department_modules m ON m.organization_id=r.organization_id AND m.module_key='invoices' AND m.is_active
 ON CONFLICT(role_id,module_id) DO UPDATE SET has_access=excluded.has_access;

-- Internal Flow is needed by Technicians/Finance as well as existing sales roles.
INSERT INTO public.role_module_access(role_id,module_id,has_access,organization_id)
 SELECT r.id,m.id,true,r.organization_id FROM public.roles r JOIN public.department_modules m ON m.organization_id=r.organization_id AND m.module_key='feed' AND m.is_active
 WHERE r.is_active AND r.role_key IN ('tech','finance')
 ON CONFLICT(role_id,module_id) DO UPDATE SET has_access=true;

-- Preserve sales duties for service users already explicitly designated sales reps.
-- Existing per-user revokes/grants and their notes always survive.
INSERT INTO public.user_permission_overrides(user_id,module_id,override_type,organization_id,notes)
 SELECT p.id,m.id,'grant',p.organization_id,'Preserved designated sales duties during role cleanup'
 FROM public.profiles p JOIN public.roles r ON r.id=p.role_id AND r.role_key='service_manager'
 JOIN public.role_module_access a ON a.role_id=r.id AND a.has_access JOIN public.department_modules m ON m.id=a.module_id
 WHERE p.is_sales_rep AND p.is_active AND p.organization_id=m.organization_id
 AND m.module_key IN ('prospects','pipeline_board','leads','fishbowl','connections','proposals','sales_orders','design_queue','sales_dashboard','sales_activity','individual_dashboard')
 ON CONFLICT(user_id,module_id) DO NOTHING;
UPDATE public.role_module_access a SET has_access=false FROM public.roles r,public.department_modules m
 WHERE a.role_id=r.id AND a.module_id=m.id AND (
 (r.role_key='service_manager' AND m.module_key IN ('prospects','pipeline_board','leads','fishbowl','connections','proposals','sales_orders','design_queue','sales_dashboard','sales_activity','individual_dashboard','time_approval','payments'))
 OR (r.role_key='business_development' AND m.module_key IN ('proposals','sales_orders','design_queue','report_templates')));

UPDATE public.profiles SET can_edit_products=false WHERE role IN ('sales','tech') AND can_edit_products=true AND NOT coalesce(can_create_purchase_orders,false);
UPDATE public.profiles SET can_create_proposals=false WHERE role='finance' AND can_create_proposals=true;

-- A permission record is not itself product editing authority. Own proposals,
-- workflow records, private conversations and billing scope retain their existing
-- separate policies; this migration does not broaden any record-level read policy.
NOTIFY pgrst,'reload schema';

-- Page grants now determine the authority of the payroll entry points. Existing
-- actor identity, period status, readiness and organization checks remain intact.
CREATE OR REPLACE FUNCTION private.require_payroll_access(p_period uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.pay_periods pp JOIN public.profiles p ON p.organization_id=pp.organization_id
   WHERE pp.id=p_period AND p.id=auth.uid() AND p.is_active) OR NOT private.can_access_page(auth.uid(),'payroll') THEN
   RAISE EXCEPTION 'Payroll permission required for this organization' USING ERRCODE='42501';
 END IF;
END $$;
DO $$ DECLARE f record; definition text; BEGIN
 FOR f IN SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace
   AND proname IN ('check_payroll_readiness','refresh_payroll_time','approve_payroll_period','reopen_pay_period') LOOP
   definition:=pg_get_functiondef(f.oid);
   IF position(E'\nBEGIN\n' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected payroll function structure'; END IF;
   definition:=replace(definition,E'\nBEGIN\n',E'\nBEGIN\nPERFORM private.require_payroll_access(p_pay_period_id);\n');
   -- Replace the legacy role allowlist with the same capability check, including
   -- explicitly authorized custom roles and Finance.
   definition:=regexp_replace(definition,'role[[:space:]]+IN[[:space:]]*\([^)]*\)','private.can_access_page(auth.uid(),''payroll'')','g');
   EXECUTE definition;
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.oid::regprocedure);
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.oid::regprocedure);
 END LOOP;
END $$;

-- Assigned/open team tasks remain available. Company-wide task browsing requires
-- its own flag. JSON extraction also supports older databases before the task
-- department-assignment migration without inventing an assignment column.
CREATE OR REPLACE FUNCTION private.can_access_task(p_task jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.profiles; dept uuid;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE id=auth.uid() AND is_active=true AND role<>'portal_user';
 IF NOT FOUND OR p.organization_id IS DISTINCT FROM (p_task->>'organization_id')::uuid THEN RETURN false; END IF;
 IF p.role='admin' OR p.can_view_all_tasks OR p.id IN ((p_task->>'user_id')::uuid,(p_task->>'assigned_to')::uuid,(p_task->>'claimed_by')::uuid) THEN RETURN true; END IF;
 dept:=nullif(p_task->>'assigned_department_id','')::uuid;
 IF nullif(p_task->>'assigned_to','') IS NULL AND dept IS NULL THEN RETURN true; END IF;
 RETURN dept IS NOT NULL AND EXISTS(SELECT 1 FROM public.department_modules m WHERE m.department_id=dept AND m.organization_id=p.organization_id AND m.is_active AND private.can_access_page(p.id,m.module_key));
END $$;
GRANT USAGE ON SCHEMA private TO authenticated;
REVOKE ALL ON FUNCTION private.can_access_task(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.can_access_task(jsonb) TO authenticated;
DROP POLICY IF EXISTS tasks_respect_assignment_scope ON public.tasks;
CREATE POLICY tasks_respect_assignment_scope ON public.tasks AS RESTRICTIVE FOR ALL TO authenticated
 USING (private.can_access_task(to_jsonb(tasks))) WITH CHECK (private.can_access_task(to_jsonb(tasks)));

UPDATE public.profiles SET can_view_all_tasks=false,can_view_all_pipeline=false WHERE role IN ('sales','finance');

CREATE OR REPLACE FUNCTION private.can_manage_payroll_org(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=p_org AND p.is_active)
 AND private.can_access_page(auth.uid(),'payroll');
$$;
REVOKE ALL ON FUNCTION private.can_manage_payroll_org(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.can_manage_payroll_org(uuid) TO authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['pay_periods','payroll_time_segments','payroll_approvals','payroll_reconciliation_flags','payroll_corrections'] LOOP
   IF to_regclass('public.'||t) IS NOT NULL THEN
     EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
     EXECUTE format('DROP POLICY IF EXISTS permission_payroll_scope ON public.%I',t);
     EXECUTE format('CREATE POLICY permission_payroll_scope ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(private.can_manage_payroll_org(organization_id)) WITH CHECK(private.can_manage_payroll_org(organization_id))',t);
   END IF;
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';

-- Department task membership follows the effective page grants, including user
-- revokes, rather than the obsolete independent department switches.
CREATE OR REPLACE FUNCTION private.user_has_department_access(p_user_id uuid,p_department_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p JOIN public.departments d ON d.organization_id=p.organization_id
   WHERE p.id=p_user_id AND p.is_active AND d.id=p_department_id AND d.is_active
   AND EXISTS(SELECT 1 FROM public.department_modules m WHERE m.department_id=d.id AND m.is_active AND private.can_access_page(p.id,m.module_key)));
$$;
REVOKE ALL ON FUNCTION private.user_has_department_access(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.user_has_department_access(uuid,uuid) TO authenticated;

-- Security-definer task transitions must enforce the same tenant/active-user
-- scope as table RLS. Fail closed if the expected existing body has changed.
DO $$ DECLARE f record; definition text; marker text; BEGIN
 FOR f IN SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('complete_task_atomic','reopen_task_atomic') LOOP
  definition:=pg_get_functiondef(f.oid);
  marker:='  SELECT (role = ''admin'') INTO v_is_admin';
  IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Unexpected task transition function structure'; END IF;
  definition:=replace(definition,marker,E'  IF NOT private.can_access_task(to_jsonb(v_task)) THEN\n    RAISE EXCEPTION ''Task permission required for this organization'' USING ERRCODE=''42501'';\n  END IF;\n\n'||marker);
  EXECUTE definition;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.enforce_atomic_task_completion()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_user IN ('authenticated','anon') AND (
  (OLD.status IS DISTINCT FROM NEW.status AND (OLD.status='completed' OR NEW.status='completed'))
  OR OLD.completed_by IS DISTINCT FROM NEW.completed_by) THEN
  RAISE EXCEPTION 'Use the atomic task transition functions';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_atomic_task_completion() FROM PUBLIC,anon,authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tasks' AND column_name='completed_by') THEN
  DROP TRIGGER IF EXISTS trigger_enforce_atomic_task_completion ON public.tasks;
  CREATE TRIGGER trigger_enforce_atomic_task_completion BEFORE UPDATE OF status,completed_by ON public.tasks
   FOR EACH ROW EXECUTE FUNCTION public.enforce_atomic_task_completion();
 END IF;
END $$;

-- Review authority is a page capability. Employee/profile configuration remains
-- separately protected by its existing administrator privilege guards.
DO $$ DECLARE definition text; oid regprocedure; BEGIN
 IF to_regprocedure('time_private.can_manage_time(uuid)') IS NOT NULL THEN
  EXECUTE $body$CREATE OR REPLACE FUNCTION time_private.can_manage_time(p_org uuid)
   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
    SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=p_org AND p.is_active)
     AND (private.can_access_page(auth.uid(),'time_approval') OR private.can_access_page(auth.uid(),'payroll') OR private.can_access_page(auth.uid(),'dispatch_dashboard'));
   $function$;$body$;
 END IF;
 oid:=to_regprocedure('public.notify_approvers_of_time_request()');
 IF oid IS NOT NULL THEN
  definition:=pg_get_functiondef(oid);
  definition:=replace(definition,'role IN (''admin'',''manager'',''service_manager'',''office_manager'',''production_manager'',''sales_manager'')',
    '(private.can_access_page(id,''time_approval'') OR private.can_access_page(id,''payroll'') OR private.can_access_page(id,''dispatch_dashboard''))');
  EXECUTE definition;
 END IF;
END $$;
ALTER TABLE private.permission_cleanup_backup ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst,'reload schema';
$mjv_cleanup$;
END $mjv_rollout$;
