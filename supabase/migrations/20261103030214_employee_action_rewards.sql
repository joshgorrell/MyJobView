-- One action-based employee program. No role plans, user point goals or quarterly awards.
CREATE TABLE public.employee_action_reward_settings(
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
 enabled boolean NOT NULL DEFAULT false,
 invoice_points_per_dollar numeric(14,8) NOT NULL DEFAULT 0.04454699 CHECK(invoice_points_per_dollar>=0 AND invoice_points_per_dollar<=1000),
 job_clock_points integer NOT NULL DEFAULT 38 CHECK(job_clock_points BETWEEN 0 AND 100000),
 review_points integer NOT NULL DEFAULT 100 CHECK(review_points BETWEEN 0 AND 100000),
 value_points integer NOT NULL DEFAULT 10000 CHECK(value_points BETWEEN 1 AND 1000000),
 value_dollars numeric(12,2) NOT NULL DEFAULT 100 CHECK(value_dollars>0 AND value_dollars<1000000),
 started_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_action_reward_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_action_reward_settings FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.employee_action_reward_settings TO authenticated;
CREATE POLICY action_settings_read ON public.employee_action_reward_settings FOR SELECT TO authenticated
 USING(organization_id=private.rewards_actor_org());
CREATE TABLE private.employee_payment_reward_sources(
 payment_id uuid PRIMARY KEY,organization_id uuid NOT NULL,invoice_id uuid NOT NULL,user_id uuid NOT NULL,
 rate numeric(14,8) NOT NULL,net_collected numeric(16,2) NOT NULL DEFAULT 0
);
CREATE TABLE private.employee_payment_reward_accounts(
 organization_id uuid NOT NULL,user_id uuid NOT NULL,posted_points integer NOT NULL DEFAULT 0,revision integer NOT NULL DEFAULT 0,
 PRIMARY KEY(organization_id,user_id)
);
CREATE TABLE private.employee_job_reward_entries(entry_id uuid PRIMARY KEY,organization_id uuid NOT NULL,user_id uuid NOT NULL);
ALTER TABLE private.employee_job_reward_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.employee_job_reward_entries FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE private.employee_job_reward_sources(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,user_id uuid NOT NULL,
 work_date date NOT NULL,job_key text NOT NULL,points_value integer NOT NULL,posted_points integer NOT NULL DEFAULT 0,revision integer NOT NULL DEFAULT 0,
 UNIQUE(organization_id,user_id,work_date,job_key)
);
CREATE TABLE private.employee_review_reward_sources(
 review_id uuid PRIMARY KEY,organization_id uuid NOT NULL,user_id uuid NOT NULL,evidence text NOT NULL,
 points integer NOT NULL,approved_by uuid NOT NULL,approved_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,evidence)
);
ALTER TABLE private.employee_payment_reward_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.employee_payment_reward_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.employee_job_reward_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.employee_review_reward_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.employee_payment_reward_sources,private.employee_payment_reward_accounts,private.employee_job_reward_sources,private.employee_review_reward_sources FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.points_transactions DROP CONSTRAINT points_transactions_transaction_type_check;
ALTER TABLE public.points_transactions ADD CONSTRAINT points_transactions_transaction_type_check
 CHECK(transaction_type IN ('task_completion','question_answer','reward_redemption','admin_adjustment','attendance','invoice_payment','job_clock','verified_review'));

-- Starting calibration for Electronic Life only. Actual attendance rules remain
-- in the existing configurable attendance engine. History and balances are retained.
INSERT INTO public.employee_action_reward_settings(organization_id,enabled)
 SELECT id,true FROM public.organizations WHERE subdomain='elife';
UPDATE public.points_configuration SET attendance_early_points=77,attendance_on_time_points=77,updated_at=now()
 WHERE organization_id IN(SELECT id FROM public.organizations WHERE subdomain='elife');

CREATE FUNCTION public.get_employee_action_rewards()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=private.rewards_actor_org();cfg jsonb;attendance jsonb;photo integer;
BEGIN
 IF NOT public.flow_has_module_access('rewards_dashboard') THEN RAISE EXCEPTION 'Rewards access required'; END IF;
 SELECT to_jsonb(s) INTO cfg FROM public.employee_action_reward_settings s WHERE organization_id=org;
 SELECT jsonb_build_object('early',attendance_early_points,'on_time',attendance_on_time_points,'late',attendance_late_points,'very_late',attendance_very_late_points) INTO attendance
 FROM public.points_configuration WHERE organization_id=org ORDER BY updated_at DESC,id DESC LIMIT 1;
 SELECT photo_upload_points INTO photo FROM public.company_settings WHERE organization_id=org LIMIT 1;
 RETURN jsonb_build_object('settings',coalesce(cfg,jsonb_build_object('enabled',false,'invoice_points_per_dollar',0.04454699,'job_clock_points',38,'review_points',100,'value_points',10000,'value_dollars',100)),
 'attendance',attendance,'photo_points',coalesce(photo,0));
END $$;
CREATE FUNCTION public.save_employee_action_rewards(p_enabled boolean,p_invoice_rate numeric,p_job_points integer,p_review_points integer,p_value_points integer,p_value_dollars numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=private.rewards_actor_org(true);
BEGIN
 IF p_enabled IS NULL OR p_invoice_rate IS NULL OR p_job_points IS NULL OR p_review_points IS NULL OR p_value_points IS NULL OR p_value_dollars IS NULL THEN RAISE EXCEPTION 'All action values are required'; END IF;
 INSERT INTO public.employee_action_reward_settings(organization_id,enabled,invoice_points_per_dollar,job_clock_points,review_points,value_points,value_dollars)
 VALUES(org,p_enabled,p_invoice_rate,p_job_points,p_review_points,p_value_points,p_value_dollars)
 ON CONFLICT(organization_id) DO UPDATE SET enabled=excluded.enabled,invoice_points_per_dollar=excluded.invoice_points_per_dollar,
 job_clock_points=excluded.job_clock_points,review_points=excluded.review_points,value_points=excluded.value_points,value_dollars=excluded.value_dollars,updated_at=now();
END $$;

-- Serializing the account avoids losing fractional points across different invoices.
-- Source rates are snapshots; refunds reverse the value actually earned.
CREATE FUNCTION private.reconcile_employee_invoice_rewards(p_invoice uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE inv public.invoices;src record;pay record;account private.employee_payment_reward_accounts;
 available numeric;principal numeric;allocated numeric;ratio numeric;net_before numeric;net_after numeric;desired integer;delta integer;
BEGIN
 SELECT * INTO inv FROM public.invoices WHERE id=p_invoice FOR UPDATE;
 FOR src IN SELECT DISTINCT organization_id,user_id FROM private.employee_payment_reward_sources WHERE invoice_id=p_invoice ORDER BY organization_id,user_id LOOP
  INSERT INTO private.employee_payment_reward_accounts(organization_id,user_id) VALUES(src.organization_id,src.user_id) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM private.employee_payment_reward_accounts WHERE organization_id=src.organization_id AND user_id=src.user_id FOR UPDATE;
 END LOOP;
 UPDATE private.employee_payment_reward_sources SET net_collected=0 WHERE invoice_id=p_invoice;
 available:=greatest(coalesce(inv.total,0),0);
 IF inv.id IS NOT NULL AND inv.total>0 AND inv.status NOT IN ('draft','void','voided','cancelled') THEN
  ratio:=greatest(0,least(inv.total,inv.total-coalesce(inv.tax_amount,0)))/inv.total;
  FOR pay IN SELECT * FROM public.payments WHERE invoice_id=p_invoice ORDER BY created_at,id LOOP
   principal:=greatest(0,pay.amount-coalesce(pay.convenience_fee_amount,0));
   allocated:=least(available,principal);available:=greatest(0,available-principal);
   net_before:=round((inv.total-available-allocated)*ratio,2);net_after:=round((inv.total-available)*ratio,2);
   UPDATE private.employee_payment_reward_sources SET net_collected=net_after-net_before
   WHERE payment_id=pay.id AND organization_id=inv.organization_id AND pay.organization_id=inv.organization_id;
  END LOOP;
 END IF;
 FOR src IN SELECT DISTINCT organization_id,user_id FROM private.employee_payment_reward_sources WHERE invoice_id=p_invoice ORDER BY organization_id,user_id LOOP
  SELECT * INTO STRICT account FROM private.employee_payment_reward_accounts WHERE organization_id=src.organization_id AND user_id=src.user_id;
  SELECT floor(coalesce(sum(net_collected*rate),0))::integer INTO desired FROM private.employee_payment_reward_sources
   WHERE organization_id=src.organization_id AND user_id=src.user_id;
  delta:=desired-account.posted_points;
  IF delta<>0 THEN
   PERFORM private.post_reward_points(src.organization_id,src.user_id,delta,'invoice_payment',p_invoice,
    'Invoice payment points (sales tax and payment fees excluded)','invoice-action:'||src.user_id||':'||(account.revision+1));
   UPDATE private.employee_payment_reward_accounts SET posted_points=desired,revision=revision+1 WHERE organization_id=src.organization_id AND user_id=src.user_id;
  END IF;
 END LOOP;
END $$;
CREATE FUNCTION private.employee_reward_payment_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM public.invoices WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END FOR UPDATE;
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM private.employee_payment_reward_sources WHERE payment_id=OLD.id)
 AND (NEW.invoice_id IS DISTINCT FROM OLD.invoice_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.id IS DISTINCT FROM OLD.id) THEN
  RAISE EXCEPTION 'Reverse a rewarded payment and record its correction instead of changing invoice, organization or identity';
 END IF;
 RETURN coalesce(NEW,OLD);
END $$;
CREATE TRIGGER employee_reward_payment_guard BEFORE INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION private.employee_reward_payment_guard();
CREATE FUNCTION private.employee_reward_payment_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE inv public.invoices;cfg public.employee_action_reward_settings;rep uuid;
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT * INTO inv FROM public.invoices WHERE id=NEW.invoice_id;
  SELECT * INTO cfg FROM public.employee_action_reward_settings WHERE organization_id=inv.organization_id;
  SELECT assigned_to INTO rep FROM public.contacts WHERE id=inv.contact_id AND organization_id=inv.organization_id;
  IF cfg.enabled AND cfg.invoice_points_per_dollar>0 AND NEW.organization_id=inv.organization_id
   AND EXISTS(SELECT 1 FROM public.profiles WHERE id=rep AND organization_id=inv.organization_id AND is_active AND role NOT IN ('portal_user','customer')) THEN
   INSERT INTO private.employee_payment_reward_sources(payment_id,organization_id,invoice_id,user_id,rate)
    VALUES(NEW.id,inv.organization_id,inv.id,rep,cfg.invoice_points_per_dollar) ON CONFLICT DO NOTHING;
  END IF;
 END IF;
 IF TG_OP='UPDATE' AND OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN PERFORM private.reconcile_employee_invoice_rewards(OLD.invoice_id); END IF;
 PERFORM private.reconcile_employee_invoice_rewards(CASE WHEN TG_OP='DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END);
 RETURN coalesce(NEW,OLD);
END $$;
CREATE TRIGGER employee_reward_payment_changed AFTER INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION private.employee_reward_payment_changed();
CREATE FUNCTION private.employee_reward_invoice_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.reconcile_employee_invoice_rewards(CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END);
 RETURN coalesce(NEW,OLD);
END $$;
CREATE TRIGGER employee_reward_invoice_changed AFTER UPDATE OF total,tax_amount,status OR DELETE ON public.invoices FOR EACH ROW EXECUTE FUNCTION private.employee_reward_invoice_changed();

CREATE FUNCTION private.reconcile_employee_job_rewards(p_org uuid,p_user uuid,p_day date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg public.employee_action_reward_settings;src private.employee_job_reward_sources;job record;tz text;desired integer;delta integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('job-actions:'||p_org||':'||p_user||':'||p_day,0));
 SELECT * INTO cfg FROM public.employee_action_reward_settings WHERE organization_id=p_org;
 SELECT coalesce(timezone,'America/Chicago') INTO tz FROM public.organizations WHERE id=p_org;
 -- Only clock-ins after activation create a new award. No historical replay.
 IF cfg.enabled AND cfg.job_clock_points>0 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user AND organization_id=p_org AND is_active AND role NOT IN ('portal_user','customer')) THEN
  FOR job IN SELECT DISTINCT CASE WHEN t.work_classification='project' AND t.project_id IS NOT NULL THEN 'project:'||t.project_id
     WHEN t.work_order_id IS NOT NULL THEN 'work_order:'||t.work_order_id ELSE 'project:'||t.project_id END AS key
   FROM public.time_entries t WHERE EXISTS(SELECT 1 FROM private.employee_job_reward_entries e WHERE e.entry_id=t.id AND e.organization_id=p_org AND e.user_id=p_user) AND t.organization_id=p_org AND t.technician_id=p_user AND t.entry_date=p_day
    AND t.clock_in>=cfg.started_at AND t.clock_in<=now() AND (t.clock_in AT TIME ZONE tz)::date=p_day
    AND t.status IS DISTINCT FROM 'rejected' AND t.entry_type IN ('project','work_order')
    AND (t.work_order_id IS NOT NULL OR t.project_id IS NOT NULL) LOOP
   INSERT INTO private.employee_job_reward_sources(organization_id,user_id,work_date,job_key,points_value)
    VALUES(p_org,p_user,p_day,job.key,cfg.job_clock_points) ON CONFLICT DO NOTHING;
  END LOOP;
 END IF;
 FOR src IN SELECT * FROM private.employee_job_reward_sources WHERE organization_id=p_org AND user_id=p_user AND work_date=p_day ORDER BY id FOR UPDATE LOOP
  SELECT CASE WHEN EXISTS(SELECT 1 FROM public.time_entries t WHERE EXISTS(SELECT 1 FROM private.employee_job_reward_entries e WHERE e.entry_id=t.id AND e.organization_id=p_org AND e.user_id=p_user) AND t.organization_id=p_org AND t.technician_id=p_user AND t.entry_date=p_day
    AND t.clock_in>=cfg.started_at AND t.clock_in<=now() AND (t.clock_in AT TIME ZONE tz)::date=p_day
    AND t.status IS DISTINCT FROM 'rejected' AND t.entry_type IN ('project','work_order')
    AND (t.project_id IS NOT NULL OR t.work_order_id IS NOT NULL)
    AND CASE WHEN t.work_classification='project' AND t.project_id IS NOT NULL THEN 'project:'||t.project_id
     WHEN t.work_order_id IS NOT NULL THEN 'work_order:'||t.work_order_id ELSE 'project:'||t.project_id END=src.job_key)
    THEN src.points_value ELSE 0 END INTO desired;
  delta:=desired-src.posted_points;
  IF delta<>0 THEN
   PERFORM private.post_reward_points(p_org,p_user,delta,'job_clock',src.id,'Job clock-in: '||p_day,
    'job-action:'||src.id||':'||(src.revision+1));
   UPDATE private.employee_job_reward_sources SET posted_points=desired,revision=revision+1 WHERE id=src.id;
  END IF;
 END LOOP;
END $$;
CREATE FUNCTION private.employee_reward_time_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg public.employee_action_reward_settings;
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT * INTO cfg FROM public.employee_action_reward_settings WHERE organization_id=NEW.organization_id;
  IF cfg.enabled AND cfg.job_clock_points>0 AND NEW.clock_in>=cfg.started_at AND NEW.clock_in<=now() THEN
   INSERT INTO private.employee_job_reward_entries(entry_id,organization_id,user_id) VALUES(NEW.id,NEW.organization_id,NEW.technician_id) ON CONFLICT DO NOTHING;
  END IF;
 END IF;
 IF TG_OP<>'INSERT' THEN PERFORM private.reconcile_employee_job_rewards(OLD.organization_id,OLD.technician_id,OLD.entry_date); END IF;
 IF TG_OP<>'DELETE' AND (TG_OP='INSERT' OR (NEW.organization_id,NEW.technician_id,NEW.entry_date) IS DISTINCT FROM (OLD.organization_id,OLD.technician_id,OLD.entry_date)) THEN
  PERFORM private.reconcile_employee_job_rewards(NEW.organization_id,NEW.technician_id,NEW.entry_date);
 END IF;
 RETURN coalesce(NEW,OLD);
END $$;
CREATE TRIGGER employee_reward_time_changed AFTER INSERT OR UPDATE OR DELETE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION private.employee_reward_time_changed();

CREATE FUNCTION public.get_employee_review_reward_queue()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=private.rewards_actor_org(true);employees jsonb;reviews jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'full_name',full_name) ORDER BY full_name),'[]') INTO employees FROM public.profiles
 WHERE organization_id=org AND is_active AND role NOT IN ('portal_user','customer');
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'contact_name',c.full_name,'sent_at',r.sent_at) ORDER BY r.sent_at DESC),'[]') INTO reviews
 FROM public.review_requests r JOIN public.contacts c ON c.id=r.contact_id AND c.organization_id=org
 WHERE r.organization_id=org AND r.review_completed AND NOT EXISTS(SELECT 1 FROM private.employee_review_reward_sources a WHERE a.review_id=r.id);
 RETURN jsonb_build_object('employees',employees,'reviews',reviews);
END $$;
CREATE FUNCTION public.award_employee_review_points(p_review uuid,p_user uuid,p_evidence text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=private.rewards_actor_org(true);amount integer;existing private.employee_review_reward_sources;
BEGIN
 IF length(trim(coalesce(p_evidence,'')))<10 OR length(p_evidence)>2000 THEN RAISE EXCEPTION 'Provide the individual review URL or verification evidence'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user AND organization_id=org AND is_active AND role NOT IN ('portal_user','customer')) THEN RAISE EXCEPTION 'Active employee required'; END IF;
 PERFORM 1 FROM public.review_requests WHERE id=p_review AND organization_id=org AND review_completed FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Completed company review required'; END IF;
 SELECT * INTO existing FROM private.employee_review_reward_sources WHERE review_id=p_review;
 IF FOUND THEN
  IF existing.user_id IS DISTINCT FROM p_user OR existing.evidence IS DISTINCT FROM lower(trim(p_evidence)) THEN RAISE EXCEPTION 'Review already rewarded'; END IF;
  RETURN existing.points;
 END IF;
 SELECT review_points INTO amount FROM public.employee_action_reward_settings WHERE organization_id=org AND enabled;
 IF coalesce(amount,0)=0 THEN RAISE EXCEPTION 'Review points are disabled'; END IF;
 INSERT INTO private.employee_review_reward_sources(review_id,organization_id,user_id,evidence,points,approved_by)
 VALUES(p_review,org,p_user,lower(trim(p_evidence)),amount,auth.uid());
 PERFORM private.post_reward_points(org,p_user,amount,'verified_review',p_review,'Verified customer review','verified-review:'||p_review);
 RETURN amount;
END $$;
REVOKE ALL ON FUNCTION public.get_employee_action_rewards(),public.save_employee_action_rewards(boolean,numeric,integer,integer,integer,numeric),public.get_employee_review_reward_queue(),public.award_employee_review_points(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_employee_action_rewards(),public.save_employee_action_rewards(boolean,numeric,integer,integer,integer,numeric),public.get_employee_review_reward_queue(),public.award_employee_review_points(uuid,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION private.reconcile_employee_invoice_rewards(uuid),private.employee_reward_payment_guard(),private.employee_reward_payment_changed(),private.employee_reward_invoice_changed(),private.reconcile_employee_job_rewards(uuid,uuid,date),private.employee_reward_time_changed() FROM PUBLIC,anon,authenticated,service_role;

-- Keep the existing employee menu consistent with configurable attendance values.
CREATE OR REPLACE FUNCTION public.get_reward_points_menu()
RETURNS TABLE(id text,category text,name text,description text,points integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE org uuid:=private.rewards_actor_org(); c public.points_configuration; s public.company_settings;
BEGIN
 IF NOT public.flow_has_module_access('rewards_dashboard') THEN RAISE EXCEPTION 'Rewards access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM public.points_configuration WHERE organization_id=org ORDER BY updated_at DESC,id LIMIT 1;
 SELECT * INTO s FROM public.company_settings WHERE organization_id=org LIMIT 1;
 RETURN QUERY SELECT v.* FROM (VALUES
 ('task_completion','Assignments','Complete an assignment','Earn the value shown on the assignment. The first eligible resolver receives the award. Creators do not earn points for their own assignments.',NULL::integer),
 ('question_answer','Assignments','Answer a Fishbowl question','The first eligible answer completion earns points; reopening reverses the actual award.',coalesce(c.question_answer_points,5)),
 ('contact_created','Customer activity','Create a contact','One award for a new employee-created contact.',coalesce(c.contact_created_points,0)),
 ('connection_logged','Customer activity','Log a connection','One award per saved connection.',coalesce(c.connection_logged_points,0)),
 ('lead_created','Customer activity','Create a lead','Anonymous lead submissions do not earn employee points.',coalesce(c.lead_created_points,0)),
 ('lead_claimed','Customer activity','Claim a lead','One award when an unclaimed lead is claimed.',coalesce(c.lead_claimed_points,0)),
 ('lead_converted','Customer activity','Convert a lead','One award when a lead becomes converted.',coalesce(c.lead_converted_points,0)),
 ('fishbowl_post','Team activity','Create a public Fishbowl post','One award for an original public general post; replies and private posts are excluded.',coalesce(c.fishbowl_post_points,0)),
 ('job_media','Job documentation','Upload a job photo or video','One award per saved upload, to its uploader.',coalesce(s.photo_upload_points,0)),
 ('attendance_early','Attendance','Arrive at least 15 minutes early','First qualifying daily clock-in; schedule, holiday and approved PTO exclusions apply.',coalesce(c.attendance_early_points,10)),
 ('attendance_on_time','Attendance','Arrive on time','First qualifying daily clock-in at or before the scheduled start.',coalesce(c.attendance_on_time_points,5)),
 ('attendance_late','Attendance','Arrive 1–15 minutes late','First qualifying daily clock-in; earlier offline arrivals are reconciled.',coalesce(c.attendance_late_points,-5)),
 ('attendance_very_late','Attendance','Arrive more than 15 minutes late','First qualifying daily clock-in.',coalesce(c.attendance_very_late_points,-10)),
 ('forgot_clock_out','Deductions','Forgot to clock out','Penalty when the company automatic clock-out job closes a forgotten daily clock entry.',CASE WHEN coalesce((to_jsonb(s)->>'auto_clock_out_enabled')::boolean,false) THEN coalesce((to_jsonb(s)->>'forgot_clock_out_penalty_points')::integer,-15) ELSE 0 END),
 ('manual_time_entry','Deductions','Manual time entry deduction','Applied only when an authorized manual correction explicitly requests a deduction.',-coalesce(c.manual_entry_points_loss,10)),
 ('same_day_callin','Deductions','Same-day PTO call-in after cutoff','Company cutoff: '||coalesce(s.pto_same_day_callin_cutoff_time::text,'07:00:00')||'. Exempt leave types are excluded.',-coalesce(s.pto_same_day_callin_points_loss,10))
 ) v(id,category,name,description,points) WHERE v.points IS NULL OR v.points<>0;
END $$;
REVOKE ALL ON FUNCTION public.get_reward_points_menu() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_reward_points_menu() TO authenticated;
