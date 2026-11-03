-- Attendance evidence is calculated once per workday, independently of GPS completion.
-- Historical rows/points are not backfilled. The original four point tiers are preserved.
ALTER TABLE public.clock_in_rewards_log ADD COLUMN attendance_date date;
CREATE UNIQUE INDEX clock_rewards_one_arrival_per_day ON public.clock_in_rewards_log(technician_id,attendance_date) WHERE attendance_date IS NOT NULL;
-- Clients cannot award their own attendance points.
REVOKE INSERT,UPDATE,DELETE ON public.clock_in_rewards_log FROM authenticated,anon;
ALTER TABLE public.points_transactions DROP CONSTRAINT points_transactions_transaction_type_check;
ALTER TABLE public.points_transactions ADD CONSTRAINT points_transactions_transaction_type_check CHECK(transaction_type IN ('task_completion','question_answer','reward_redemption','admin_adjustment','attendance'));

CREATE OR REPLACE FUNCTION public.check_late_clock_in() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.profiles; cfg record; first_entry public.daily_clock_entries; old_log public.clock_in_rewards_log;
 tz text; expected time; finish time; scheduled_days text[]; local_actual timestamp; expected_at timestamp;
 delta int; kind text; amount int; adjustment int; leave_row record; day_name text;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE id=NEW.technician_id;
 IF p.organization_id IS NULL THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('attendance:'||p.id::text||':'||NEW.entry_date::text,0));
 -- An earlier offline arrival can replace a later synced arrival; a return punch never earns twice.
 SELECT * INTO first_entry FROM public.daily_clock_entries WHERE technician_id=p.id AND entry_date=NEW.entry_date ORDER BY clock_in,id LIMIT 1;
 IF first_entry.id IS DISTINCT FROM NEW.id THEN RETURN NEW; END IF;
 IF coalesce((to_jsonb(first_entry)->>'admin_adjusted')::boolean,false) THEN RETURN NEW; END IF;
 IF time_private.time_basis(p.id,NEW.entry_date)<>'daily_clock' THEN RETURN NEW; END IF;
 SELECT c.standard_start_time,c.standard_end_time,c.work_days INTO cfg
 FROM public.employees e JOIN public.employee_payroll_configs c ON c.employee_id=e.id AND c.organization_id=p.organization_id
 WHERE e.user_id=p.id AND c.effective_from<=NEW.entry_date AND (c.effective_to IS NULL OR c.effective_to>=NEW.entry_date)
 ORDER BY c.effective_from DESC LIMIT 1;
 IF FOUND THEN expected:=cfg.standard_start_time; finish:=cfg.standard_end_time; scheduled_days:=cfg.work_days;
 ELSE expected:=p.standard_start_time; finish:=coalesce((to_jsonb(p)->>'standard_end_time')::time,'17:00'::time); scheduled_days:=p.work_days; END IF;
 day_name:=(ARRAY['sunday','monday','tuesday','wednesday','thursday','friday','saturday'])[extract(dow FROM NEW.entry_date)::int+1];
 IF expected IS NULL OR scheduled_days IS NULL OR NOT day_name=ANY(scheduled_days) OR pto_private.is_company_holiday(p.organization_id,NEW.entry_date) THEN RETURN NEW; END IF;
 -- Move the expected arrival past contiguous approved morning leave. Full-day leave is unscored.
 FOR leave_row IN SELECT r.request_type,r.leave_days FROM public.pto_requests r WHERE r.organization_id=p.organization_id AND r.employee_id=p.id AND r.status='approved' AND public.pto_hours_on_date(r,NEW.entry_date)>0 ORDER BY r.start_date LOOP
  IF leave_row.request_type='full_day' OR leave_row.leave_days IS NULL THEN RETURN NEW; END IF;
 END LOOP;
 FOR leave_row IN SELECT (d->>'start')::time starts,(d->>'end')::time ends FROM public.pto_requests r CROSS JOIN LATERAL jsonb_array_elements(r.leave_days) d
 WHERE r.organization_id=p.organization_id AND r.employee_id=p.id AND r.status='approved' AND (d->>'date')::date=NEW.entry_date ORDER BY (d->>'start')::time LOOP
  IF leave_row.starts<=expected AND leave_row.ends>expected THEN expected:=leave_row.ends; END IF;
 END LOOP;
 IF finish IS NOT NULL AND expected>=finish THEN RETURN NEW; END IF;
 SELECT coalesce(timezone,'America/Chicago') INTO tz FROM public.organizations WHERE id=p.organization_id;
 local_actual:=NEW.clock_in AT TIME ZONE coalesce(tz,'America/Chicago'); expected_at:=NEW.entry_date+expected;
 delta:=ceil(extract(epoch FROM (local_actual-expected_at))/60);
 IF delta<=-15 THEN kind:='early';amount:=10;
 ELSIF delta<=0 THEN kind:='on_time';amount:=5;
 ELSIF delta<=15 THEN kind:='late';amount:=-5;
 ELSE kind:='very_late';amount:=-10; END IF;
 SELECT * INTO old_log FROM public.clock_in_rewards_log WHERE technician_id=p.id AND attendance_date=NEW.entry_date;
 adjustment:=amount-coalesce(old_log.points_awarded,0);
 INSERT INTO public.clock_in_rewards_log(organization_id,technician_id,daily_clock_entry_id,attendance_date,event_type,points_awarded,minutes_delta,scheduled_time,actual_time)
 VALUES(p.organization_id,p.id,NEW.id,NEW.entry_date,kind,amount,delta,expected,local_actual::time)
 ON CONFLICT(technician_id,attendance_date) WHERE attendance_date IS NOT NULL DO UPDATE SET daily_clock_entry_id=excluded.daily_clock_entry_id,event_type=excluded.event_type,points_awarded=excluded.points_awarded,minutes_delta=excluded.minutes_delta,scheduled_time=excluded.scheduled_time,actual_time=excluded.actual_time;
 -- The existing points_transactions trigger owns the profile balance, preventing double credit.
 IF adjustment<>0 THEN INSERT INTO public.points_transactions(organization_id,user_id,points_amount,transaction_type,reference_id,description)
 VALUES(p.organization_id,p.id,adjustment,'attendance',NEW.id,'Daily arrival: '||replace(kind,'_',' ')||' ('||NEW.entry_date::text||')'); END IF;
 DELETE FROM public.time_clock_alerts WHERE technician_id=p.id AND alert_date=NEW.entry_date AND alert_type='really_late' AND NOT coalesce(resolved,false);
 IF kind='very_late' THEN INSERT INTO public.time_clock_alerts(organization_id,technician_id,alert_date,alert_type,scheduled_start_time,actual_clock_in_time,minutes_late)
 VALUES(p.organization_id,p.id,NEW.entry_date,'really_late',expected,local_actual::time,delta); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.check_late_clock_in() FROM PUBLIC,anon,authenticated;
-- Existing trigger_check_late_clock_in calls this on daily entry INSERT.

-- Separate who may approve from who receives notifications. Admins retain recovery access.
CREATE TABLE public.pto_routing_settings(
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
 approver_ids uuid[] NOT NULL DEFAULT '{}',notification_ids uuid[] NOT NULL DEFAULT '{}',
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pto_routing_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pto_routing_settings FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.pto_routing_settings TO authenticated;
CREATE POLICY pto_routing_read ON public.pto_routing_settings FOR SELECT TO authenticated USING(organization_id=public.get_user_org_id());
CREATE OR REPLACE FUNCTION public.can_manage_pto() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active AND (
 p.role='admin' OR (p.role IN ('manager','service_manager','office_manager','production_manager') AND (
 NOT EXISTS(SELECT 1 FROM public.pto_routing_settings s WHERE s.organization_id=p.organization_id) OR
 EXISTS(SELECT 1 FROM public.pto_routing_settings s WHERE s.organization_id=p.organization_id AND p.id=ANY(s.approver_ids))))));
$$;
CREATE OR REPLACE FUNCTION public.save_pto_routing(p_approvers uuid[],p_notify uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE org uuid;
BEGIN
 SELECT organization_id INTO org FROM public.profiles WHERE id=auth.uid() AND is_active AND role='admin';
 IF org IS NULL THEN RAISE EXCEPTION 'Only administrators may configure PTO routing'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(coalesce(p_approvers,'{}')) AS requested(user_id) WHERE NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=requested.user_id AND p.organization_id=org AND p.is_active AND p.role IN ('admin','manager','service_manager','office_manager','production_manager'))) THEN RAISE EXCEPTION 'Choose active managers in your organization as approvers'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(coalesce(p_notify,'{}')) AS requested(user_id) WHERE NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=requested.user_id AND p.organization_id=org AND p.is_active)) THEN RAISE EXCEPTION 'Choose active users in your organization for notifications'; END IF;
 INSERT INTO public.pto_routing_settings(organization_id,approver_ids,notification_ids) VALUES(org,coalesce(p_approvers,'{}'),coalesce(p_notify,'{}')) ON CONFLICT(organization_id) DO UPDATE SET approver_ids=excluded.approver_ids,notification_ids=excluded.notification_ids,updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.save_pto_routing(uuid[],uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_pto_routing(uuid[],uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION pto_private.notify_request() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE recipients uuid[]; recipient uuid; employee_name text; heading text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 SELECT p.full_name INTO employee_name FROM public.profiles p WHERE p.id=NEW.employee_id;
 SELECT s.notification_ids INTO recipients FROM public.pto_routing_settings s WHERE s.organization_id=NEW.organization_id;
 IF recipients IS NULL THEN SELECT array_agg(id) INTO recipients FROM public.profiles WHERE organization_id=NEW.organization_id AND is_active AND role IN ('admin','manager','service_manager','office_manager','production_manager'); END IF;
 heading:=CASE WHEN TG_OP='INSERT' THEN 'New PTO request' ELSE 'PTO request '||NEW.status END;
 IF TG_OP='UPDATE' THEN recipients:=array_append(coalesce(recipients,'{}'),NEW.employee_id); END IF;
 FOR recipient IN SELECT DISTINCT v FROM unnest(coalesce(recipients,'{}')) v WHERE v IS NOT NULL LOOP
  IF EXISTS(SELECT 1 FROM public.profiles WHERE id=recipient AND organization_id=NEW.organization_id AND is_active) THEN
   INSERT INTO public.notifications(organization_id,user_id,type,title,body,related_id,is_read) VALUES(NEW.organization_id,recipient,'system',heading,employee_name||' · '||NEW.start_date::text||' to '||NEW.end_date::text,NEW.id,false);
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION pto_private.notify_request() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER pto_request_notification AFTER INSERT OR UPDATE OF status ON public.pto_requests FOR EACH ROW EXECUTE FUNCTION pto_private.notify_request();

-- Four weeks is the minimum notice; existing longer policies are preserved.
UPDATE public.company_settings SET pto_vacation_advance_days=greatest(coalesce(pto_vacation_advance_days,28),28);
ALTER TABLE public.company_settings ALTER COLUMN pto_vacation_advance_days SET DEFAULT 28;
-- Serialize approval with bookings, using the same employee lock as assert_booking.
CREATE OR REPLACE FUNCTION pto_private.lock_approval() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NEW.status='approved' AND OLD.status IS DISTINCT FROM NEW.status THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('booking:'||NEW.organization_id::text||':'||NEW.employee_id::text,0));
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION pto_private.lock_approval() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER pto_lock_booking BEFORE UPDATE OF status ON public.pto_requests FOR EACH ROW EXECUTE FUNCTION pto_private.lock_approval();

-- A client cannot forge an attendance ledger entry through the generic points API.
CREATE OR REPLACE FUNCTION time_private.guard_attendance_ledger() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF pg_trigger_depth()=1 AND (CASE WHEN TG_OP='DELETE' THEN OLD.transaction_type='attendance' WHEN TG_OP='INSERT' THEN NEW.transaction_type='attendance' ELSE NEW.transaction_type='attendance' OR OLD.transaction_type='attendance' END) THEN RAISE EXCEPTION 'Attendance points are generated by daily arrivals'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION time_private.guard_attendance_ledger() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER protect_attendance_ledger BEFORE INSERT OR UPDATE OR DELETE ON public.points_transactions FOR EACH ROW EXECUTE FUNCTION time_private.guard_attendance_ledger();

-- Existing historical open shifts need manager correction, not invented clock-out timestamps.
CREATE OR REPLACE FUNCTION time_private.prevent_duplicate_daily_start() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NEW.clock_out IS NOT NULL THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('daily-start:'||NEW.technician_id::text,0));
 IF EXISTS(SELECT 1 FROM public.daily_clock_entries WHERE technician_id=NEW.technician_id AND clock_out IS NULL AND id<>NEW.id) THEN RAISE EXCEPTION 'An unfinished daily shift exists. Close it or ask a manager to correct it before starting a new shift'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION time_private.prevent_duplicate_daily_start() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER prevent_duplicate_daily_start BEFORE INSERT ON public.daily_clock_entries FOR EACH ROW EXECUTE FUNCTION time_private.prevent_duplicate_daily_start();
REVOKE ALL ON FUNCTION public.can_manage_pto() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_pto() TO authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
  IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='pto_requests') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.pto_requests; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='clock_in_rewards_log') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.clock_in_rewards_log; END IF;
 END IF;
END $$;

-- Enforce the four-week minimum even if an older settings client writes a shorter value.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.review_time_off(uuid,text,text,boolean)'::regprocedure) INTO definition;
 definition:=replace(definition,'coalesce(pto_vacation_advance_days,14)','greatest(coalesce(pto_vacation_advance_days,28),28)');
 definition:=replace(definition,'coalesce(notice,14)','greatest(coalesce(notice,28),28)');
 EXECUTE definition;
END $$;
