ALTER TABLE public.pto_requests
  ADD COLUMN leave_category text CHECK (leave_category IN ('sick', 'vacation'));

-- Submit via the existing reservation and validation workflow in the same transaction.
CREATE FUNCTION public.submit_classified_pto(
  p_policy uuid, p_start date, p_end date, p_type text, p_category text,
  p_start_time time DEFAULT NULL, p_end_time time DEFAULT NULL,
  p_reason text DEFAULT NULL, p_called_manager boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  request_id uuid;
  today date;
  reason text := nullif(btrim(p_reason), '');
BEGIN
  IF p_category IS NULL OR p_category NOT IN ('sick', 'vacation') THEN
    RAISE EXCEPTION 'Choose Sick or Vacation';
  END IF;

  SELECT (now() AT TIME ZONE coalesce(o.timezone, 'America/Chicago'))::date
    INTO today
  FROM public.profiles staff
  JOIN public.organizations o ON o.id = staff.organization_id
  JOIN public.pto_policies policy ON policy.organization_id = o.id
  WHERE staff.id = auth.uid() AND staff.is_active
    AND staff.employment_classification = 'employee'
    AND policy.id = p_policy AND policy.is_active AND policy.is_paid
    AND policy.pto_type IN ('vacation', 'sick', 'personal');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Select your active paid time off policy';
  END IF;

  IF p_start = today THEN
    IF p_called_manager IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Call your manager and confirm before submitting a same-day request';
    END IF;
    reason := concat_ws(E'\n', coalesce(reason, 'Same-day call-in'),
      format('Manager phone call self-attested by employee %s at %s UTC.',
        auth.uid(), now() AT TIME ZONE 'UTC'));
  END IF;

  request_id := public.submit_time_off(p_policy, p_start, p_end, p_type, p_start_time, p_end_time, reason);
  UPDATE public.pto_requests SET leave_category = p_category WHERE id = request_id;
  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_classified_pto(uuid,date,date,text,text,time,time,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_classified_pto(uuid,date,date,text,text,time,time,text,boolean) TO authenticated;

-- Apply advance notice to the selected category. Legacy requests retain their policy behavior.
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
 SELECT coalesce(r.leave_category, pto_type) INTO kind FROM public.pto_policies WHERE id=r.policy_id;
 SELECT coalesce(pto_vacation_advance_days,14) INTO notice FROM public.company_settings WHERE organization_id=org LIMIT 1;
 IF p_action='approved' AND kind='vacation' AND r.start_date-(r.submitted_at AT TIME ZONE (SELECT coalesce(timezone,'America/Chicago') FROM public.organizations WHERE id=org))::date<coalesce(notice,14) AND (NOT p_override OR nullif(btrim(p_notes),'') IS NULL) THEN RAISE EXCEPTION 'Short-notice vacation requires a manager override reason'; END IF;
 IF p_action='approved' THEN FOR day IN SELECT generate_series(r.start_date::timestamp,r.end_date::timestamp,interval '1 day')::date LOOP PERFORM time_private.assert_open_time_period(r.employee_id,org,day); END LOOP; END IF;
 IF p_action='approved' AND EXISTS(SELECT 1 FROM public.payroll_time_segments WHERE organization_id=org AND employee_id=r.employee_id AND segment_date BETWEEN r.start_date AND r.end_date AND is_locked) THEN RAISE EXCEPTION 'Reopen the affected payroll period before approving this leave'; END IF;
 UPDATE public.pto_requests SET status=p_action,reviewed_by=auth.uid(),reviewed_at=now(),review_notes=p_notes,override_advance_notice=p_override,override_reason=CASE WHEN p_override THEN p_notes END WHERE id=r.id;
END $$;
