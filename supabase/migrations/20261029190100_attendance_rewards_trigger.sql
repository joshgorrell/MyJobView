-- Keep attendance scoring in the existing daily clock trigger.
-- Only the four award amounts become organization configurable.
CREATE OR REPLACE FUNCTION public.check_late_clock_in()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 p public.profiles; cfg record; first_entry public.daily_clock_entries;
 old_log public.clock_in_rewards_log; tz text; expected time; finish time;
 scheduled_days text[]; local_actual timestamp; expected_at timestamp;
 delta int; kind text; amount int; adjustment int; leave_row record; day_name text;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE id=NEW.technician_id;
 IF p.organization_id IS NULL THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('attendance:'||p.id::text||':'||NEW.entry_date::text,0));
 SELECT * INTO first_entry FROM public.daily_clock_entries
 WHERE technician_id=p.id AND entry_date=NEW.entry_date ORDER BY clock_in,id LIMIT 1;
 IF first_entry.id IS DISTINCT FROM NEW.id THEN RETURN NEW; END IF;
 IF coalesce((to_jsonb(first_entry)->>'admin_adjusted')::boolean,false) THEN RETURN NEW; END IF;
 IF time_private.time_basis(p.id,NEW.entry_date)<>'daily_clock' THEN RETURN NEW; END IF;
 SELECT c.standard_start_time,c.standard_end_time,c.work_days INTO cfg
 FROM public.employees e JOIN public.employee_payroll_configs c
 ON c.employee_id=e.id AND c.organization_id=p.organization_id
 WHERE e.user_id=p.id AND c.effective_from<=NEW.entry_date
 AND (c.effective_to IS NULL OR c.effective_to>=NEW.entry_date)
 ORDER BY c.effective_from DESC LIMIT 1;
 IF FOUND THEN
 expected:=cfg.standard_start_time; finish:=cfg.standard_end_time; scheduled_days:=cfg.work_days;
 ELSE
 expected:=p.standard_start_time;
 finish:=coalesce((to_jsonb(p)->>'standard_end_time')::time,'17:00'::time);
 scheduled_days:=p.work_days;
 END IF;
 day_name:=(ARRAY['sunday','monday','tuesday','wednesday','thursday','friday','saturday'])[extract(dow FROM NEW.entry_date)::int+1];
 IF expected IS NULL OR scheduled_days IS NULL OR NOT day_name=ANY(scheduled_days)
 OR pto_private.is_company_holiday(p.organization_id,NEW.entry_date) THEN RETURN NEW; END IF;
 FOR leave_row IN SELECT r.request_type,r.leave_days FROM public.pto_requests r
 WHERE r.organization_id=p.organization_id AND r.employee_id=p.id AND r.status='approved'
 AND public.pto_hours_on_date(r,NEW.entry_date)>0 ORDER BY r.start_date LOOP
 IF leave_row.request_type='full_day' OR leave_row.leave_days IS NULL THEN RETURN NEW; END IF;
 END LOOP;
 FOR leave_row IN
 SELECT (d->>'start')::time starts,(d->>'end')::time ends
 FROM public.pto_requests r CROSS JOIN LATERAL jsonb_array_elements(r.leave_days) d
 WHERE r.organization_id=p.organization_id AND r.employee_id=p.id AND r.status='approved'
 AND (d->>'date')::date=NEW.entry_date ORDER BY (d->>'start')::time LOOP
 IF leave_row.starts<=expected AND leave_row.ends>expected THEN expected:=leave_row.ends; END IF;
 END LOOP;
 IF finish IS NOT NULL AND expected>=finish THEN RETURN NEW; END IF;
 SELECT coalesce(timezone,'America/Chicago') INTO tz FROM public.organizations WHERE id=p.organization_id;
 local_actual:=NEW.clock_in AT TIME ZONE coalesce(tz,'America/Chicago');
 expected_at:=NEW.entry_date+expected;
 delta:=ceil(extract(epoch FROM (local_actual-expected_at))/60);
 IF delta<=-15 THEN kind:='early';
 ELSIF delta<=0 THEN kind:='on_time';
 ELSIF delta<=15 THEN kind:='late';
 ELSE kind:='very_late'; END IF;
 SELECT CASE kind
 WHEN 'early' THEN attendance_early_points
 WHEN 'on_time' THEN attendance_on_time_points
 WHEN 'late' THEN attendance_late_points
 ELSE attendance_very_late_points END INTO amount
 FROM public.points_configuration WHERE organization_id=p.organization_id
 ORDER BY updated_at DESC,id DESC LIMIT 1;
 amount:=coalesce(amount,CASE kind WHEN 'early' THEN 10 WHEN 'on_time' THEN 5
 WHEN 'late' THEN -5 ELSE -10 END);
 SELECT * INTO old_log FROM public.clock_in_rewards_log
 WHERE technician_id=p.id AND attendance_date=NEW.entry_date;
 adjustment:=amount-coalesce(old_log.points_awarded,0);
 INSERT INTO public.clock_in_rewards_log
 (organization_id,technician_id,daily_clock_entry_id,attendance_date,event_type,points_awarded,minutes_delta,scheduled_time,actual_time)
 VALUES(p.organization_id,p.id,NEW.id,NEW.entry_date,kind,amount,delta,expected,local_actual::time)
 ON CONFLICT(technician_id,attendance_date) WHERE attendance_date IS NOT NULL
 DO UPDATE SET daily_clock_entry_id=excluded.daily_clock_entry_id,event_type=excluded.event_type,
 points_awarded=excluded.points_awarded,minutes_delta=excluded.minutes_delta,
 scheduled_time=excluded.scheduled_time,actual_time=excluded.actual_time;
 IF adjustment<>0 THEN
 INSERT INTO public.points_transactions
 (organization_id,user_id,points_amount,transaction_type,reference_id,description)
 VALUES(p.organization_id,p.id,adjustment,'attendance',NEW.id,
 'Daily arrival: '||replace(kind,'_',' ')||' ('||NEW.entry_date::text||')');
 END IF;
 DELETE FROM public.time_clock_alerts WHERE technician_id=p.id AND alert_date=NEW.entry_date
 AND alert_type='really_late' AND NOT coalesce(resolved,false);
 IF kind='very_late' THEN
 INSERT INTO public.time_clock_alerts
 (organization_id,technician_id,alert_date,alert_type,scheduled_start_time,actual_clock_in_time,minutes_late)
 VALUES(p.organization_id,p.id,NEW.entry_date,'really_late',expected,local_actual::time,delta);
 END IF;
 RETURN NEW;
END $fn$;