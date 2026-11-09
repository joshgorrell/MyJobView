-- Fixed PTO day equivalents. This changes future previews/submissions only.
-- Existing requests, leave days, balances and approved payroll entries are untouched.
-- Workday eligibility and holiday exclusions remain tied to the employee schedule.
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
 -- PTO day lengths are fixed company-wide; payroll schedule still determines eligible dates.
 daily:=8;
 IF p_type<>'full_day' AND (p_start_time IS NULL OR p_end_time IS NULL OR p_end_time<=p_start_time OR p_end_time>='24:00'::time) THEN RAISE EXCEPTION 'Select the start and end time for partial leave'; END IF;
 IF p_type='hours' AND p_start<>p_end THEN RAISE EXCEPTION 'Specific-hours requests must be for one date'; END IF;
 st:=coalesce(cfg.standard_start_time,'08:00'::time); en:=(st+interval '8 hours')::time;
 IF p_type<>'full_day' THEN
  hrs:=extract(epoch FROM p_end_time-p_start_time)/3600;
  IF hrs>daily OR p_start_time<st OR p_end_time>coalesce(cfg.standard_end_time,en) THEN RAISE EXCEPTION 'Partial leave must fall within your scheduled working hours'; END IF;
  IF p_type='half_day' AND abs(hrs-daily/2)>0.01 THEN RAISE EXCEPTION 'Half-day leave must equal 4 hours'; END IF;
 END IF;
 FOR day IN SELECT generate_series(p_start::timestamp,p_end::timestamp,interval '1 day')::date LOOP
  IF names[extract(dow FROM day)::int+1]=ANY(cfg.work_days) AND NOT pto_private.is_company_holiday(public.get_user_org_id(),day) THEN
   days:=days||jsonb_build_array(jsonb_build_object('date',day,'hours',round(CASE WHEN p_type='full_day' THEN daily ELSE hrs END,2),'start',CASE WHEN p_type='full_day' THEN st ELSE p_start_time END,'end',CASE WHEN p_type='full_day' THEN en ELSE p_end_time END));
  END IF;
 END LOOP;
 IF jsonb_array_length(days)=0 THEN RAISE EXCEPTION 'No scheduled workdays in this date range'; END IF;
 RETURN days;
END $$;
