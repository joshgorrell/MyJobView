-- Manager-recorded same-day call-ins are pending requests, never payroll entries.
ALTER TABLE public.pto_requests
  ADD COLUMN IF NOT EXISTS recorded_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS call_received_by_manager boolean NOT NULL DEFAULT false;

-- The recording manager cannot approve their own recorded call-in.
CREATE OR REPLACE FUNCTION pto_private.prevent_self_reviewed_call_in()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $
BEGIN
 IF NEW.status IN ('approved','denied') AND OLD.status IS DISTINCT FROM NEW.status
   AND OLD.recorded_by IS NOT NULL AND OLD.recorded_by = auth.uid() THEN
  RAISE EXCEPTION 'A different manager must review this recorded call-in';
 END IF;
 RETURN NEW;
END $;
REVOKE ALL ON FUNCTION pto_private.prevent_self_reviewed_call_in() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS prevent_self_reviewed_call_in ON public.pto_requests;
CREATE TRIGGER prevent_self_reviewed_call_in BEFORE UPDATE OF status ON public.pto_requests
FOR EACH ROW EXECUTE FUNCTION pto_private.prevent_self_reviewed_call_in();

CREATE OR REPLACE FUNCTION public.record_employee_call_in(
 p_employee uuid, p_policy uuid, p_type text,
 p_start_time time DEFAULT NULL, p_end_time time DEFAULT NULL,
 p_reason text DEFAULT NULL, p_call_received boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE org uuid; today date; days jsonb; total numeric; paid boolean; kind text;
 bal public.pto_balances; req uuid;
BEGIN
 IF NOT public.can_manage_pto() THEN RAISE EXCEPTION 'Not authorized to record employee absences'; END IF;
 IF NOT p_call_received THEN RAISE EXCEPTION 'Confirm the employee personally called their manager'; END IF;
 org:=public.get_user_org_id();
 IF org IS NULL OR NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id=p_employee AND p.organization_id=org
   AND p.is_active AND p.employment_classification='employee'
 ) THEN RAISE EXCEPTION 'Select an active employee in your organization'; END IF;
 IF p_employee=auth.uid() THEN RAISE EXCEPTION 'Use your own leave request form'; END IF;
 SELECT (now() AT TIME ZONE coalesce(o.timezone,'America/Chicago'))::date INTO today
 FROM public.organizations o WHERE o.id=org;
 SELECT is_paid,pto_type INTO paid,kind FROM public.pto_policies
 WHERE id=p_policy AND organization_id=org AND is_active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Select an active leave policy'; END IF;
 SELECT * INTO bal FROM public.pto_balances
 WHERE employee_id=p_employee AND policy_id=p_policy AND organization_id=org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assign this leave policy before recording the absence'; END IF;
 days:=pto_private.request_days(p_employee,today,today,p_type,p_start_time,p_end_time);
 SELECT sum((item->>'hours')::numeric) INTO total FROM jsonb_array_elements(days) item;
 IF paid AND kind IN ('vacation','sick','personal') AND total>bal.current_balance_hours-bal.pending_hours
 THEN RAISE EXCEPTION 'Insufficient available leave balance'; END IF;
 IF paid AND NOT EXISTS (
  SELECT 1 FROM public.employee_payroll_configs c JOIN public.employees e ON e.id=c.employee_id
  WHERE e.user_id=p_employee AND c.organization_id=org AND c.pto_eligible
   AND c.effective_from<=today AND (c.effective_to IS NULL OR c.effective_to>=today)
 ) THEN RAISE EXCEPTION 'Paid leave eligibility must be configured'; END IF;
 IF EXISTS (
  SELECT 1 FROM public.pto_requests r CROSS JOIN LATERAL jsonb_array_elements(days) d
  WHERE r.organization_id=org AND r.employee_id=p_employee AND r.status IN ('pending','approved')
   AND public.pto_hours_on_date(r,(d->>'date')::date)>0
   AND (r.leave_days IS NULL OR r.request_type='full_day' OR p_type='full_day'
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(r.leave_days) old
     WHERE old->>'date'=d->>'date'
      AND (old->>'start')::time<(d->>'end')::time
      AND (old->>'end')::time>(d->>'start')::time))
 ) THEN RAISE EXCEPTION 'An overlapping leave request already exists'; END IF;
 INSERT INTO public.pto_requests
  (organization_id,employee_id,policy_id,request_type,start_date,end_date,total_hours,
   leave_days,reason,status,recorded_by,call_received_by_manager)
 VALUES (org,p_employee,p_policy,p_type,today,today,total,days,
  nullif(btrim(p_reason),''),'pending',auth.uid(),true)
 RETURNING id INTO req;
 RETURN req;
END $$;
REVOKE ALL ON FUNCTION public.record_employee_call_in(uuid,uuid,text,time,time,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_employee_call_in(uuid,uuid,text,time,time,text,boolean) TO authenticated;
