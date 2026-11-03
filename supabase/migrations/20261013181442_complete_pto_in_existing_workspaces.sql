-- PTO stays in My Time Off, Command Center, and Dispatch. No fabricated opening balances.
CREATE SCHEMA IF NOT EXISTS pto_private;
REVOKE ALL ON SCHEMA pto_private FROM PUBLIC, anon, authenticated;
ALTER TABLE public.pto_requests ADD COLUMN IF NOT EXISTS leave_days jsonb;
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS pto_request_id uuid REFERENCES public.pto_requests(id);
CREATE INDEX IF NOT EXISTS time_entries_pto_request_idx ON public.time_entries(pto_request_id) WHERE pto_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.can_manage_pto() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND role IN ('admin','manager','service_manager','office_manager','production_manager'));
$$;
REVOKE ALL ON FUNCTION public.can_manage_pto() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_pto() TO authenticated;

-- A deliberately narrow shared feed: no policy, reason, balances, pending requests or review notes.
CREATE OR REPLACE FUNCTION public.team_time_off(p_from date,p_to date)
RETURNS TABLE(request_id uuid,employee_id uuid,employee_name text,leave_date date,start_time time,end_time time,hours numeric,full_day boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE org uuid;
BEGIN
 SELECT organization_id INTO org FROM public.profiles WHERE id=auth.uid() AND is_active;
 IF org IS NULL THEN RAISE EXCEPTION 'Sign in to view team availability'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>366 THEN RAISE EXCEPTION 'Select a date range of one year or less'; END IF;
 RETURN QUERY
 SELECT r.id,r.employee_id,p.full_name,d.day::date,
  CASE WHEN r.leave_days IS NULL THEN NULL::time ELSE (j.item->>'start')::time END,
  CASE WHEN r.leave_days IS NULL THEN NULL::time ELSE (j.item->>'end')::time END,
  public.pto_hours_on_date(r,d.day::date),
  r.request_type='full_day' OR r.leave_days IS NULL
 FROM public.pto_requests r JOIN public.profiles p ON p.id=r.employee_id AND p.organization_id=org
 CROSS JOIN LATERAL generate_series(greatest(r.start_date,p_from)::timestamp,least(r.end_date,p_to)::timestamp,interval '1 day') d(day)
 LEFT JOIN LATERAL (SELECT item FROM jsonb_array_elements(r.leave_days) item WHERE (item->>'date')::date=d.day::date LIMIT 1) j ON true
 WHERE r.organization_id=org AND r.status='approved' AND public.pto_hours_on_date(r,d.day::date)>0
 ORDER BY d.day,p.full_name,r.id;
END $$;

-- Legacy requests retain their recorded total, apportioned over their original calendar dates.
CREATE OR REPLACE FUNCTION public.pto_hours_on_date(r public.pto_requests,p_date date) RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT CASE WHEN p_date NOT BETWEEN r.start_date AND r.end_date THEN 0
 WHEN r.leave_days IS NULL THEN r.total_hours/greatest(1,r.end_date-r.start_date+1)
 ELSE coalesce((SELECT sum((item->>'hours')::numeric) FROM jsonb_array_elements(r.leave_days) item WHERE (item->>'date')::date=p_date),0) END;
$$;
REVOKE ALL ON FUNCTION public.pto_hours_on_date(public.pto_requests,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pto_hours_on_date(public.pto_requests,date) TO authenticated;
REVOKE ALL ON FUNCTION public.team_time_off(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.team_time_off(date,date) TO authenticated;

-- Replace permissive company-only policies with ownership and manager authority.
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename IN ('pto_requests','pto_balances','pto_policies','pto_accrual_history') LOOP
  EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename);
 END LOOP;
END $$;
CREATE POLICY pto_requests_read ON public.pto_requests FOR SELECT TO authenticated USING(organization_id=public.get_user_org_id() AND (employee_id=auth.uid() OR public.can_manage_pto()));
CREATE POLICY pto_balances_read ON public.pto_balances FOR SELECT TO authenticated USING(organization_id=public.get_user_org_id() AND (employee_id=auth.uid() OR public.can_manage_pto()));
CREATE POLICY pto_policies_read ON public.pto_policies FOR SELECT TO authenticated USING(organization_id=public.get_user_org_id());
CREATE POLICY pto_policies_manage ON public.pto_policies FOR ALL TO authenticated USING(organization_id=public.get_user_org_id() AND public.can_manage_pto()) WITH CHECK(organization_id=public.get_user_org_id() AND public.can_manage_pto());
CREATE POLICY pto_history_read ON public.pto_accrual_history FOR SELECT TO authenticated USING(organization_id=public.get_user_org_id() AND (employee_id=auth.uid() OR public.can_manage_pto()));
REVOKE ALL ON public.pto_requests,public.pto_balances,public.pto_accrual_history FROM anon,authenticated;
GRANT SELECT ON public.pto_requests,public.pto_balances,public.pto_accrual_history TO authenticated;

-- Respect an existing company holiday calendar without requiring the reporting add-on.
CREATE OR REPLACE FUNCTION pto_private.is_company_holiday(p_org uuid,p_date date) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE holiday boolean;
BEGIN
 IF to_regclass('public.labor_dashboard_calendars') IS NULL THEN RETURN false; END IF;
 EXECUTE 'SELECT $1=ANY(holidays) FROM public.labor_dashboard_calendars WHERE organization_id=$2' INTO holiday USING p_date,p_org;
 RETURN coalesce(holiday,false);
END $$;
REVOKE ALL ON FUNCTION pto_private.is_company_holiday(uuid,date) FROM PUBLIC,anon,authenticated;

-- Snapshot the employee's actual workdays/hours for consistent approval, payroll and calendar results.
CREATE OR REPLACE FUNCTION pto_private.request_days(p_employee uuid,p_start date,p_end date,p_type text,p_start_time time,p_end_time time)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE cfg record; days jsonb:='[]'; day date; names text[]:=ARRAY['sunday','monday','tuesday','wednesday','thursday','friday','saturday']; daily numeric; hrs numeric; st time; en time;
BEGIN
 IF p_start IS NULL OR p_end IS NULL OR p_end<p_start OR p_end-p_start>366 THEN RAISE EXCEPTION 'Select a valid date range of one year or less'; END IF;
 IF p_type NOT IN ('full_day','half_day','hours') THEN RAISE EXCEPTION 'Choose a request type'; END IF;
 SELECT c.* INTO cfg FROM public.employee_payroll_configs c JOIN public.employees e ON e.id=c.employee_id
 WHERE e.user_id=p_employee AND c.organization_id=public.get_user_org_id() AND c.effective_from<=p_start AND (c.effective_to IS NULL OR c.effective_to>=p_end)
 ORDER BY c.effective_from DESC LIMIT 1;
 IF NOT FOUND OR cfg.work_days IS NULL OR cardinality(cfg.work_days)=0 OR cfg.expected_weekly_hours IS NULL OR cfg.expected_weekly_hours<=0 THEN
  RAISE EXCEPTION 'Your manager must configure your workdays and weekly hours before requesting leave'; END IF;
 daily:=cfg.expected_weekly_hours/cardinality(cfg.work_days);
 IF p_type<>'full_day' AND (p_start_time IS NULL OR p_end_time IS NULL OR p_end_time<=p_start_time OR p_end_time>='24:00'::time) THEN RAISE EXCEPTION 'Select the start and end time for partial leave'; END IF;
 IF p_type='hours' AND p_start<>p_end THEN RAISE EXCEPTION 'Specific-hours requests must be for one date'; END IF;
 st:=coalesce(cfg.standard_start_time,'08:00'::time); en:=coalesce(cfg.standard_end_time,(st+daily*interval '1 hour')::time);
 IF p_type<>'full_day' THEN
  hrs:=extract(epoch FROM p_end_time-p_start_time)/3600;
  IF hrs>daily OR p_start_time<st OR p_end_time>en THEN RAISE EXCEPTION 'Partial leave must fall within your scheduled working hours'; END IF;
  IF p_type='half_day' AND abs(hrs-daily/2)>0.01 THEN RAISE EXCEPTION 'Half-day leave must equal half your daily working hours'; END IF;
 END IF;
 FOR day IN SELECT generate_series(p_start::timestamp,p_end::timestamp,interval '1 day')::date LOOP
  IF names[extract(dow FROM day)::int+1]=ANY(cfg.work_days) AND NOT pto_private.is_company_holiday(public.get_user_org_id(),day) THEN
   days:=days||jsonb_build_array(jsonb_build_object('date',day,'hours',round(CASE WHEN p_type='full_day' THEN daily ELSE hrs END,2),'start',CASE WHEN p_type='full_day' THEN st ELSE p_start_time END,'end',CASE WHEN p_type='full_day' THEN en ELSE p_end_time END));
  END IF;
 END LOOP;
 IF jsonb_array_length(days)=0 THEN RAISE EXCEPTION 'No scheduled workdays in this date range'; END IF;
 RETURN days;
END $$;
REVOKE ALL ON FUNCTION pto_private.request_days(uuid,date,date,text,time,time) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.preview_time_off(p_start date,p_end date,p_type text,p_start_time time DEFAULT NULL,p_end_time time DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND employment_classification='employee') THEN RAISE EXCEPTION 'Only active employees may request leave'; END IF;
 RETURN pto_private.request_days(auth.uid(),p_start,p_end,p_type,p_start_time,p_end_time);
END $$;

CREATE OR REPLACE FUNCTION public.submit_time_off(p_policy uuid,p_start date,p_end date,p_type text,p_start_time time DEFAULT NULL,p_end_time time DEFAULT NULL,p_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE org uuid; days jsonb; total numeric; req uuid; paid boolean; kind text; bal public.pto_balances;
BEGIN
 SELECT organization_id INTO org FROM public.profiles WHERE id=auth.uid() AND is_active AND employment_classification='employee';
 IF org IS NULL THEN RAISE EXCEPTION 'Only active employees may request leave'; END IF;
 SELECT is_paid,pto_type INTO paid,kind FROM public.pto_policies WHERE id=p_policy AND organization_id=org AND is_active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Select an active leave policy'; END IF;
 SELECT * INTO bal FROM public.pto_balances WHERE employee_id=auth.uid() AND policy_id=p_policy AND organization_id=org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Your manager must assign this leave policy before you request it'; END IF;
 IF p_start<(SELECT (now() AT TIME ZONE coalesce(timezone,'America/Chicago'))::date FROM public.organizations WHERE id=org) THEN RAISE EXCEPTION 'New leave requests cannot start in the past'; END IF;
 days:=pto_private.request_days(auth.uid(),p_start,p_end,p_type,p_start_time,p_end_time);
 SELECT sum((item->>'hours')::numeric) INTO total FROM jsonb_array_elements(days) item;
 IF paid AND kind IN ('vacation','sick','personal') AND total>bal.current_balance_hours-bal.pending_hours THEN RAISE EXCEPTION 'Insufficient available leave balance'; END IF;
 IF paid AND NOT EXISTS(SELECT 1 FROM public.employee_payroll_configs c JOIN public.employees e ON e.id=c.employee_id WHERE e.user_id=auth.uid() AND c.organization_id=org AND c.pto_eligible AND c.effective_from<=p_start AND (c.effective_to IS NULL OR c.effective_to>=p_end)) THEN RAISE EXCEPTION 'Paid leave eligibility must be configured by your manager'; END IF;
 IF EXISTS(SELECT 1 FROM public.pto_requests r CROSS JOIN LATERAL jsonb_array_elements(days) d WHERE r.organization_id=org AND r.employee_id=auth.uid() AND r.status IN ('pending','approved') AND public.pto_hours_on_date(r,(d->>'date')::date)>0 AND (r.leave_days IS NULL OR r.request_type='full_day' OR p_type='full_day' OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.leave_days) old WHERE old->>'date'=d->>'date' AND (old->>'start')::time<(d->>'end')::time AND (old->>'end')::time>(d->>'start')::time))) THEN RAISE EXCEPTION 'You already have a request covering this time'; END IF;
 INSERT INTO public.pto_requests(organization_id,employee_id,policy_id,request_type,start_date,end_date,total_hours,leave_days,reason,status)
 VALUES(org,auth.uid(),p_policy,p_type,p_start,p_end,total,days,nullif(btrim(p_reason),''),'pending') RETURNING id INTO req;
 RETURN req;
END $$;

-- Balance mutations are serialized; cancellation reverses reservations/approved use.
CREATE OR REPLACE FUNCTION public.update_pto_balance_on_approval() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE limited boolean;
BEGIN
 SELECT is_paid AND pto_type IN ('vacation','sick','personal') INTO limited FROM public.pto_policies WHERE id=NEW.policy_id;
 IF OLD.status='pending' AND NEW.status IN ('approved','denied','cancelled') THEN
  UPDATE public.pto_balances SET pending_hours=greatest(0,pending_hours-OLD.total_hours),current_balance_hours=current_balance_hours-CASE WHEN NEW.status='approved' AND limited THEN OLD.total_hours ELSE 0 END,used_hours_ytd=used_hours_ytd+CASE WHEN NEW.status='approved' THEN OLD.total_hours ELSE 0 END,updated_at=now() WHERE employee_id=OLD.employee_id AND policy_id=OLD.policy_id AND organization_id=OLD.organization_id;
 ELSIF OLD.status='approved' AND NEW.status='cancelled' THEN
  UPDATE public.pto_balances SET current_balance_hours=current_balance_hours+CASE WHEN limited THEN OLD.total_hours ELSE 0 END,used_hours_ytd=greatest(0,used_hours_ytd-OLD.total_hours),updated_at=now() WHERE employee_id=OLD.employee_id AND policy_id=OLD.policy_id AND organization_id=OLD.organization_id;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.reserve_pto_balance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 UPDATE public.pto_balances SET pending_hours=pending_hours+NEW.total_hours,updated_at=now() WHERE employee_id=NEW.employee_id AND policy_id=NEW.policy_id AND organization_id=NEW.organization_id;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.create_leave_time_entry_on_approval() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE d record; entry uuid; tz text;
BEGIN
 SELECT coalesce(timezone,'America/Chicago') INTO tz FROM public.organizations WHERE id=NEW.organization_id;
 IF OLD.status='pending' AND NEW.status='approved' THEN
  FOR d IN SELECT leave_date,start_time,end_time,hours FROM public.team_time_off(NEW.start_date,NEW.end_date) WHERE request_id=NEW.id LOOP
   INSERT INTO public.time_entries(organization_id,company_id,technician_id,entry_date,clock_in,clock_out,total_hours,status,entry_type,notes,approved_by,approved_at,pto_request_id)
   SELECT NEW.organization_id,NEW.organization_id,NEW.employee_id,d.leave_date,(d.leave_date+coalesce(d.start_time,'08:00'::time)) AT TIME ZONE tz,(d.leave_date+(coalesce(d.start_time,'08:00'::time)+d.hours*interval '1 hour')::time) AT TIME ZONE tz,d.hours,'approved',p.pto_type,'Approved time off',NEW.reviewed_by,NEW.reviewed_at,NEW.id FROM public.pto_policies p WHERE p.id=NEW.policy_id RETURNING id INTO entry;
  END LOOP;
  UPDATE public.pto_requests SET time_entry_id=entry WHERE id=NEW.id;
 ELSIF OLD.status='approved' AND NEW.status='cancelled' THEN
  DELETE FROM public.time_entries WHERE pto_request_id=NEW.id;
  UPDATE public.payroll_time_segments seg SET total_hours=(SELECT coalesce(sum(public.pto_hours_on_date(r,seg.segment_date)),0) FROM public.pto_requests r JOIN public.pto_policies p ON p.id=r.policy_id WHERE r.organization_id=NEW.organization_id AND r.employee_id=NEW.employee_id AND r.status='approved' AND p.is_paid) WHERE seg.organization_id=NEW.organization_id AND seg.employee_id=NEW.employee_id AND seg.time_type='pto' AND seg.segment_date BETWEEN NEW.start_date AND NEW.end_date AND NOT seg.is_locked;
  DELETE FROM public.payroll_time_segments WHERE organization_id=NEW.organization_id AND employee_id=NEW.employee_id AND time_type='pto' AND segment_date BETWEEN NEW.start_date AND NEW.end_date AND total_hours=0 AND NOT is_locked;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.reserve_pto_balance(),public.update_pto_balance_on_approval(),public.create_leave_time_entry_on_approval() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.review_time_off(p_request uuid,p_action text,p_notes text DEFAULT NULL,p_override boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.pto_requests; org uuid; kind text; notice int; today date; day date;
BEGIN
 org:=public.get_user_org_id();
 IF NOT public.can_manage_pto() THEN RAISE EXCEPTION 'Only authorized managers may review leave'; END IF;
 SELECT * INTO r FROM public.pto_requests WHERE id=p_request AND organization_id=org FOR UPDATE;
 IF NOT FOUND OR r.status<>'pending' THEN RAISE EXCEPTION 'This request is no longer pending'; END IF;
 IF r.employee_id=auth.uid() THEN RAISE EXCEPTION 'Another manager must review your own request'; END IF;
 IF p_action NOT IN ('approved','denied') THEN RAISE EXCEPTION 'Select approve or deny'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('booking:'||org::text||':'||r.employee_id::text,0));
 today:=(SELECT (now() AT TIME ZONE coalesce(timezone,'America/Chicago'))::date FROM public.organizations WHERE id=org);
 SELECT pto_type INTO kind FROM public.pto_policies WHERE id=r.policy_id;
 SELECT coalesce(pto_vacation_advance_days,14) INTO notice FROM public.company_settings WHERE organization_id=org LIMIT 1;
 IF p_action='approved' AND kind='vacation' AND r.start_date-(r.submitted_at AT TIME ZONE (SELECT coalesce(timezone,'America/Chicago') FROM public.organizations WHERE id=org))::date<coalesce(notice,14) AND (NOT p_override OR nullif(btrim(p_notes),'') IS NULL) THEN RAISE EXCEPTION 'Short-notice vacation requires a manager override reason'; END IF;
 IF p_action='approved' THEN FOR day IN SELECT generate_series(r.start_date::timestamp,r.end_date::timestamp,interval '1 day')::date LOOP PERFORM time_private.assert_open_time_period(r.employee_id,org,day); END LOOP; END IF;
 IF p_action='approved' AND EXISTS(SELECT 1 FROM public.payroll_time_segments WHERE organization_id=org AND employee_id=r.employee_id AND segment_date BETWEEN r.start_date AND r.end_date AND is_locked) THEN RAISE EXCEPTION 'Reopen the affected payroll period before approving this leave'; END IF;
 UPDATE public.pto_requests SET status=p_action,reviewed_by=auth.uid(),reviewed_at=now(),review_notes=p_notes,override_advance_notice=p_override,override_reason=CASE WHEN p_override THEN p_notes END WHERE id=r.id;
END $$;
CREATE OR REPLACE FUNCTION public.cancel_time_off(p_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.pto_requests; today date; day date;
BEGIN
 SELECT * INTO r FROM public.pto_requests WHERE id=p_request AND organization_id=public.get_user_org_id() FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active) OR (r.employee_id<>auth.uid() AND NOT public.can_manage_pto()) THEN RAISE EXCEPTION 'You cannot cancel this request'; END IF;
 IF r.status NOT IN ('pending','approved') THEN RAISE EXCEPTION 'This request is already closed'; END IF;
 today:=(SELECT (now() AT TIME ZONE coalesce(timezone,'America/Chicago'))::date FROM public.organizations WHERE id=r.organization_id);
 IF r.status='approved' AND r.start_date<=today AND NOT public.can_manage_pto() THEN RAISE EXCEPTION 'Contact your manager to cancel leave that has already started'; END IF;
 FOR day IN SELECT generate_series(r.start_date::timestamp,r.end_date::timestamp,interval '1 day')::date LOOP PERFORM time_private.assert_open_time_period(r.employee_id,r.organization_id,day); END LOOP;
 IF EXISTS(SELECT 1 FROM public.payroll_time_segments WHERE organization_id=r.organization_id AND employee_id=r.employee_id AND segment_date BETWEEN r.start_date AND r.end_date AND is_locked) THEN RAISE EXCEPTION 'Reopen the affected payroll period before cancelling leave'; END IF;
 UPDATE public.pto_requests SET status='cancelled' WHERE id=r.id;
END $$;
CREATE OR REPLACE FUNCTION public.set_time_off_balance(p_employee uuid,p_policy uuid,p_hours numeric,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE org uuid; old numeric;
BEGIN
 org:=public.get_user_org_id();
 IF NOT public.can_manage_pto() THEN RAISE EXCEPTION 'Only authorized managers may set leave balances'; END IF;
 IF p_hours IS NULL OR p_hours<0 OR p_hours>10000 OR nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Enter verified hours and an adjustment reason'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_employee AND organization_id=org AND is_active AND employment_classification='employee') OR NOT EXISTS(SELECT 1 FROM public.pto_policies WHERE id=p_policy AND organization_id=org AND is_active) THEN RAISE EXCEPTION 'Select an active employee and policy in your organization'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('pto-balance:'||p_employee::text||':'||p_policy::text,0));
 IF EXISTS(SELECT 1 FROM public.pto_balances b JOIN public.pto_policies p ON p.id=b.policy_id WHERE b.organization_id=org AND b.employee_id=p_employee AND b.policy_id=p_policy AND p.is_paid AND p.pto_type IN ('vacation','sick','personal') AND b.pending_hours>p_hours) THEN RAISE EXCEPTION 'Resolve pending requests before reducing the balance below reserved hours'; END IF;
 SELECT current_balance_hours INTO old FROM public.pto_balances WHERE organization_id=org AND employee_id=p_employee AND policy_id=p_policy FOR UPDATE;
 INSERT INTO public.pto_balances(organization_id,employee_id,policy_id,current_balance_hours,adjustment_reason) VALUES(org,p_employee,p_policy,p_hours,p_reason)
 ON CONFLICT(employee_id,policy_id) DO UPDATE SET current_balance_hours=p_hours,adjustment_reason=p_reason,updated_at=now();
 INSERT INTO public.pto_accrual_history(organization_id,employee_id,policy_id,accrual_date,hours_accrued,accrual_type,notes,created_by) VALUES(org,p_employee,p_policy,current_date,p_hours-coalesce(old,0),'adjustment',p_reason,auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.preview_time_off(date,date,text,time,time),public.submit_time_off(uuid,date,date,text,time,time,text),public.review_time_off(uuid,text,text,boolean),public.cancel_time_off(uuid),public.set_time_off_balance(uuid,uuid,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_time_off(date,date,text,time,time),public.submit_time_off(uuid,date,date,text,time,time,text),public.review_time_off(uuid,text,text,boolean),public.cancel_time_off(uuid),public.set_time_off_balance(uuid,uuid,numeric,text) TO authenticated;

-- Same-day penalties must use this tenant's settings and local date, not UTC or another tenant.
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef(oid) INTO def FROM pg_proc WHERE proname='deduct_same_day_callin_points' AND pronamespace='public'::regnamespace;
 def:=replace(def,'NEW.start_date = CURRENT_DATE','NEW.start_date = (SELECT (now() AT TIME ZONE coalesce(timezone,''America/Chicago''))::date FROM public.organizations WHERE id=NEW.organization_id)');
 def:=replace(def,'FROM company_settings','FROM company_settings WHERE organization_id=NEW.organization_id');
 def:=replace(def,'''America/Chicago'')::time','(SELECT coalesce(timezone,''America/Chicago'') FROM public.organizations WHERE id=NEW.organization_id))::time');
 EXECUTE def;
END $$;
REVOKE ALL ON FUNCTION public.deduct_same_day_callin_points() FROM PUBLIC,anon,authenticated;

-- Preserve the existing payroll pipeline, but use daily allocations and exclude mirrored leave entries.
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef(oid) INTO def FROM pg_proc WHERE proname='regenerate_payroll_segments' AND pronamespace='public'::regnamespace;
 IF def IS NULL OR position('SUM(pr.total_hours)' in def)=0 THEN RAISE EXCEPTION 'Expected payroll regeneration function is missing'; END IF;
 def:=replace(def,E'BEGIN\n',E'BEGIN\n  IF auth.uid() IS NULL OR p_organization_id IS DISTINCT FROM public.get_user_org_id() OR NOT public.can_manage_pto() THEN RAISE EXCEPTION ''Payroll review permission required''; END IF;\n');
 def:=replace(def,'SUM(pr.total_hours)','SUM(public.pto_hours_on_date(pr,v_seg_date))');
 def:=replace(def,'AND te.status = ''approved''','AND te.status = ''approved'' AND te.pto_request_id IS NULL AND te.entry_type NOT IN (''vacation'',''sick'',''personal'',''bereavement'',''jury_duty'',''unpaid'')');
 EXECUTE def;
END $$;
-- Reuse the existing booking guard with exact leave windows rather than whole-day range blocking.
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef(oid) INTO def FROM pg_proc WHERE proname='assert_booking' AND pronamespace='work_order_private'::regnamespace;
 IF def IS NULL THEN RAISE EXCEPTION 'Apply complete_work_order_scheduling first'; END IF;
 def:=replace(def,'p_date BETWEEN start_date AND end_date','public.pto_hours_on_date(pto_requests,p_date)>0 AND (request_type=''full_day'' OR leave_days IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(leave_days) d WHERE (d->>''date'')::date=p_date AND (d->>''start'')::time<p_end AND (d->>''end'')::time>p_start))');
 EXECUTE def;
END $$;
CREATE OR REPLACE FUNCTION public.team_work_schedule(p_from date,p_to date)
RETURNS TABLE(employee_id uuid,employee_name text,work_date date,scheduled boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE org uuid; names text[]:=ARRAY['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
BEGIN
 SELECT organization_id INTO org FROM public.profiles WHERE id=auth.uid() AND is_active;
 IF org IS NULL THEN RAISE EXCEPTION 'Sign in to view team availability'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>366 THEN RAISE EXCEPTION 'Select a date range of one year or less'; END IF;
 RETURN QUERY SELECT p.id,p.full_name,d.day::date,CASE WHEN c.work_days IS NULL THEN NULL ELSE names[extract(dow FROM d.day)::int+1]=ANY(c.work_days) AND NOT pto_private.is_company_holiday(org,d.day::date) END
 FROM public.profiles p CROSS JOIN generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d(day)
 LEFT JOIN LATERAL(SELECT cfg.work_days FROM public.employee_payroll_configs cfg JOIN public.employees e ON e.id=cfg.employee_id WHERE e.user_id=p.id AND cfg.organization_id=org AND cfg.effective_from<=d.day::date AND (cfg.effective_to IS NULL OR cfg.effective_to>=d.day::date) ORDER BY cfg.effective_from DESC LIMIT 1)c ON true
 WHERE p.organization_id=org AND p.is_active AND p.employment_classification='employee' ORDER BY p.full_name,p.id,d.day;
END $$;
REVOKE ALL ON FUNCTION public.team_work_schedule(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.team_work_schedule(date,date) TO authenticated;
CREATE OR REPLACE FUNCTION public.time_off_coverage(p_request uuid)
RETURNS TABLE(kind text,title text,work_date date,start_time time,end_time time)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.pto_requests;
BEGIN
 IF NOT public.can_manage_pto() THEN RAISE EXCEPTION 'Only authorized managers may review coverage'; END IF;
 SELECT * INTO r FROM public.pto_requests WHERE id=p_request AND organization_id=public.get_user_org_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
 RETURN QUERY
 SELECT 'job'::text,w.title,w.scheduled_date,w.scheduled_start_time,w.scheduled_end_time FROM public.work_orders w
 WHERE w.organization_id=r.organization_id AND w.assigned_to=r.employee_id AND coalesce(w.status,'pending') NOT IN ('completed','cancelled','archived','split') AND NOT coalesce(w.is_archived,false)
 AND public.pto_hours_on_date(r,w.scheduled_date)>0 AND (r.request_type='full_day' OR r.leave_days IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.leave_days) d WHERE (d->>'date')::date=w.scheduled_date AND (d->>'start')::time<coalesce(w.scheduled_end_time,'23:59'::time) AND (d->>'end')::time>coalesce(w.scheduled_start_time,'00:00'::time)))
 UNION ALL
 SELECT 'appointment'::text,a.title,a.appointment_date::date,a.start_time::time,a.end_time::time FROM public.appointments a
 WHERE a.organization_id=r.organization_id AND a.assigned_technician=r.employee_id AND coalesce(a.status,'scheduled') NOT IN ('completed','cancelled','archived') AND public.pto_hours_on_date(r,a.appointment_date::date)>0
 AND (a.all_day OR r.request_type='full_day' OR r.leave_days IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.leave_days) d WHERE (d->>'date')::date=a.appointment_date::date AND (d->>'start')::time<coalesce(a.end_time::time,'23:59'::time) AND (d->>'end')::time>coalesce(a.start_time::time,'00:00'::time)));
END $$;
REVOKE ALL ON FUNCTION public.time_off_coverage(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.time_off_coverage(uuid) TO authenticated;
-- Mirrored payable leave is owned by the PTO workflow, not editable through generic time APIs.
CREATE OR REPLACE FUNCTION pto_private.guard_leave_entry() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE req uuid;
BEGIN
 IF TG_OP='DELETE' THEN req:=OLD.pto_request_id; ELSE req:=NEW.pto_request_id; END IF;
 IF req IS NOT NULL OR (TG_OP='UPDATE' AND OLD.pto_request_id IS NOT NULL) THEN
  IF pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Use the time off workflow to change approved leave entries'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION pto_private.guard_leave_entry() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aa_guard_leave_entry BEFORE INSERT OR UPDATE OR DELETE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION pto_private.guard_leave_entry();
