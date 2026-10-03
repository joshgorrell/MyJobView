-- Alerts are independent of charging; no customer/employee can run the email worker.
ALTER TABLE public.company_settings ADD COLUMN billing_alert_email text;
ALTER TABLE public.security_billing_cycles ADD COLUMN processor_payment_type text CHECK(processor_payment_type IN ('card','ach'));
ALTER TABLE public.security_billing_cycles ADD COLUMN settlement_check_due_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.security_billing_cycles ADD COLUMN settlement_check_token uuid;
ALTER TABLE public.security_billing_cycles ADD COLUMN settlement_check_until timestamptz;
ALTER TABLE public.security_billing_cycles ADD COLUMN settlement_observation text;
ALTER TABLE public.security_billing_cycles ADD COLUMN returned_at timestamptz;
ALTER TABLE public.security_billing_cycles ADD COLUMN returned_reviewed_at timestamptz;
ALTER TABLE public.security_billing_cycles ADD COLUMN state_changed_at timestamptz NOT NULL DEFAULT now();
UPDATE public.security_billing_cycles SET state_changed_at=coalesce(debit_after,created_at) WHERE state IN ('pending','paid');
-- Before this feature, active-account methods could not be replaced through MJV. Preserve that original type.
UPDATE public.security_billing_cycles b SET processor_payment_type=CASE WHEN c.payment_method='ach' THEN 'ach' WHEN c.payment_method='credit_card' THEN 'card' END FROM public.security_contracts c WHERE c.id=b.contract_id AND c.organization_id=b.organization_id AND b.processor_id IS NOT NULL;
CREATE INDEX security_settlement_watch_work ON public.security_billing_cycles(settlement_check_due_at,state_changed_at) WHERE state='paid' AND processor_payment_type='ach';
CREATE INDEX security_unreviewed_returns ON public.security_billing_cycles(contract_id) WHERE returned_at IS NOT NULL AND returned_reviewed_at IS NULL;
CREATE TABLE public.security_payment_alerts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),
 contract_id uuid NOT NULL REFERENCES public.security_contracts(id),cycle_id uuid REFERENCES public.security_billing_cycles(id),
 issue_key text NOT NULL,kind text NOT NULL CHECK(kind IN ('card_expiring','card_expired','method_missing','payment_failed','payment_returned','payment_unknown','billing_blocked','settlement_delayed','accounting_delayed')),
 title text NOT NULL,detail text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),last_seen_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz,acknowledged_at timestamptz,acknowledged_by uuid REFERENCES public.profiles(id)
);
CREATE UNIQUE INDEX security_payment_alerts_issue ON public.security_payment_alerts(issue_key) WHERE resolved_at IS NULL;
CREATE INDEX security_payment_alerts_open ON public.security_payment_alerts(organization_id,created_at) WHERE resolved_at IS NULL;
CREATE TABLE public.security_payment_alert_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),alert_id uuid NOT NULL REFERENCES public.security_payment_alerts(id),organization_id uuid NOT NULL REFERENCES public.organizations(id),
 audience text NOT NULL CHECK(audience IN ('customer','staff')),reminder integer NOT NULL DEFAULT 0,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','sending','sent','cancelled')),attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_token uuid,lease_until timestamptz,sent_at timestamptz,provider_id text,last_error text,frozen_message jsonb,UNIQUE(alert_id,audience,reminder)
);
CREATE INDEX security_payment_alert_delivery_work ON public.security_payment_alert_deliveries(next_attempt_at) WHERE state IN ('queued','sending');
CREATE TABLE public.security_payment_alert_health(organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),last_scan_at timestamptz NOT NULL);
CREATE TABLE public.security_autopay_method_changes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),contract_id uuid NOT NULL REFERENCES public.security_contracts(id),actor_id uuid NOT NULL REFERENCES public.profiles(id),old_method_id uuid,new_method_id uuid NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION private.security_payment_alert_access(p_org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=p_org AND p.is_active AND p.role IN ('admin','finance')) OR private.security_staff_access(p_org,true);
$$;
REVOKE ALL ON FUNCTION private.security_payment_alert_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.security_payment_alert_access(uuid) TO authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['security_payment_alerts','security_payment_alert_deliveries','security_payment_alert_health','security_autopay_method_changes'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY payment_alert_staff_read ON public.%I FOR SELECT TO authenticated USING(private.security_payment_alert_access(organization_id))',t);
 END LOOP;
END $$;
CREATE FUNCTION public.set_billing_alert_email(p_email text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.profiles%ROWTYPE; value text:=nullif(btrim(p_email),''); BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=auth.uid() AND is_active AND role IN ('admin','finance');
 IF actor.id IS NULL THEN RAISE EXCEPTION 'Admin or finance permission required' USING ERRCODE='42501'; END IF;
 IF value IS NOT NULL AND (length(value)>254 OR value !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$') THEN RAISE EXCEPTION 'Enter one valid billing alert email address'; END IF;
 UPDATE public.company_settings SET billing_alert_email=value WHERE organization_id=actor.organization_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Configure company settings first'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_billing_alert_email(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_billing_alert_email(text) TO authenticated;
CREATE FUNCTION private.security_payment_method_charge_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.security_payment_methods%ROWTYPE; BEGIN
 IF NEW.state IS DISTINCT FROM OLD.state THEN NEW.state_changed_at:=now(); END IF;
 IF NEW.state='processing' AND OLD.state IS DISTINCT FROM 'processing' THEN
  IF EXISTS(SELECT 1 FROM public.security_billing_cycles b WHERE b.contract_id=NEW.contract_id AND b.returned_at IS NOT NULL AND b.returned_reviewed_at IS NULL) THEN RAISE EXCEPTION 'Reconcile the returned payment before another automatic debit';END IF;
  SELECT mth.* INTO m FROM public.security_contracts c JOIN public.security_payment_methods mth ON mth.id=c.security_payment_method_id AND mth.organization_id=c.organization_id AND mth.contact_id=c.contact_id WHERE c.id=NEW.contract_id AND c.organization_id=NEW.organization_id AND mth.is_active FOR SHARE OF mth;
  IF m.id IS NULL OR (m.payment_type='card' AND (m.exp_month IS NULL OR m.exp_month NOT BETWEEN 1 AND 12 OR m.exp_year IS NULL OR m.exp_year NOT BETWEEN 2000 AND 9998)) THEN RAISE EXCEPTION 'Saved payment method needs verification before charging'; END IF;
  IF m.payment_type='card' AND (make_date(m.exp_year,m.exp_month,1)+interval '1 month')::date<=(now() AT TIME ZONE 'America/Chicago')::date THEN RAISE EXCEPTION 'Saved card has expired; update it before charging'; END IF;
  NEW.processor_payment_type:=m.payment_type;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.security_payment_method_charge_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER security_payment_method_charge_guard BEFORE UPDATE ON public.security_billing_cycles FOR EACH ROW EXECUTE FUNCTION private.security_payment_method_charge_guard();
CREATE FUNCTION public.replace_security_autopay_method(p_contract uuid,p_method uuid,p_reason text,p_authorized boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.security_contracts%ROWTYPE; m public.security_payment_methods%ROWTYPE; BEGIN
 SELECT * INTO c FROM public.security_contracts WHERE id=p_contract FOR UPDATE;
 IF c.id IS NULL OR NOT private.security_staff_access(c.organization_id,true) THEN RAISE EXCEPTION 'Contract Management permission required' USING ERRCODE='42501'; END IF;
 IF c.status<>'active' OR c.security_billing_mode<>'autopay' OR c.autopay_authorized_at IS NULL OR c.autopay_revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Only an active authorized AutoPay agreement can change its payment method'; END IF;
 IF p_authorized IS DISTINCT FROM true OR length(btrim(coalesce(p_reason,'')))<10 THEN RAISE EXCEPTION 'Confirm customer authorization and document the change'; END IF;
 IF EXISTS(SELECT 1 FROM public.security_billing_cycles WHERE contract_id=c.id AND state IN ('processing','pending','unknown')) THEN RAISE EXCEPTION 'Reconcile the existing payment before changing the method'; END IF;
 SELECT * INTO m FROM public.security_payment_methods WHERE id=p_method AND contact_id=c.contact_id AND organization_id=c.organization_id AND is_active AND verified_at>now()-interval '5 minutes' FOR SHARE;
 IF m.id IS NULL THEN RAISE EXCEPTION 'Verify a method belonging to this customer'; END IF;
 IF m.payment_type='card' THEN
  IF m.exp_month IS NULL OR m.exp_month NOT BETWEEN 1 AND 12 OR m.exp_year IS NULL OR m.exp_year NOT BETWEEN 2000 AND 9998 THEN RAISE EXCEPTION 'Card expiration needs verification'; END IF;
  IF (make_date(m.exp_year,m.exp_month,1)+interval '1 month')::date<=(now() AT TIME ZONE 'America/Chicago')::date THEN RAISE EXCEPTION 'Choose an unexpired card'; END IF;
 END IF;
 INSERT INTO public.security_autopay_method_changes(organization_id,contract_id,actor_id,old_method_id,new_method_id,reason) VALUES(c.organization_id,c.id,auth.uid(),c.security_payment_method_id,m.id,left(btrim(p_reason),1000));
 PERFORM set_config('mjv.security_signing','true',true);
 UPDATE public.security_contracts SET security_payment_method_id=m.id,payment_method=CASE WHEN m.payment_type='card' THEN 'credit_card' ELSE 'ach' END WHERE id=c.id;
 PERFORM set_config('mjv.security_signing','false',true);
 UPDATE public.security_payment_alerts SET resolved_at=now() WHERE contract_id=c.id AND organization_id=c.organization_id AND resolved_at IS NULL AND kind IN ('card_expiring','card_expired','method_missing');
 UPDATE public.security_payment_alert_deliveries d SET state='cancelled',lease_token=NULL,lease_until=NULL FROM public.security_payment_alerts a WHERE a.id=d.alert_id AND a.contract_id=c.id AND a.organization_id=c.organization_id AND a.resolved_at IS NOT NULL AND d.state IN ('queued','sending');
END $$;
REVOKE ALL ON FUNCTION public.replace_security_autopay_method(uuid,uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.replace_security_autopay_method(uuid,uuid,text,boolean) TO authenticated;
CREATE FUNCTION private.upsert_security_payment_alert(p_org uuid,p_contract uuid,p_cycle uuid,p_key text,p_kind text,p_title text,p_detail text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.security_payment_alerts%ROWTYPE; BEGIN
 INSERT INTO public.security_payment_alerts(organization_id,contract_id,cycle_id,issue_key,kind,title,detail) VALUES(p_org,p_contract,p_cycle,p_key,p_kind,p_title,p_detail)
 ON CONFLICT(issue_key) WHERE resolved_at IS NULL DO UPDATE SET last_seen_at=now() RETURNING * INTO a;
 INSERT INTO public.security_payment_alert_deliveries(alert_id,organization_id,audience) VALUES(a.id,a.organization_id,'staff') ON CONFLICT DO NOTHING;
 IF a.kind IN ('card_expiring','card_expired','method_missing','payment_failed','payment_returned') THEN INSERT INTO public.security_payment_alert_deliveries(alert_id,organization_id,audience) VALUES(a.id,a.organization_id,'customer') ON CONFLICT DO NOTHING; END IF;
 RETURN a.id;
END $$;
REVOKE ALL ON FUNCTION private.upsert_security_payment_alert(uuid,uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.scan_security_payment_alerts(p_today date DEFAULT (now() AT TIME ZONE 'America/Chicago')::date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r record;a uuid;seen uuid[]:='{}';kind text;stage text;expiry date;days integer;title text;detail text;reminder integer;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('security-payment-alert-scan',0));
 FOR r IN SELECT c.*,m.id method_id,m.is_active method_active,m.payment_type,m.exp_month,m.exp_year FROM public.security_contracts c LEFT JOIN public.security_payment_methods m ON m.id=c.security_payment_method_id AND m.organization_id=c.organization_id AND m.contact_id=c.contact_id WHERE c.status='active' AND c.security_billing_mode='autopay' AND c.autopay_authorized_at IS NOT NULL AND NOT c.autopay_paused AND c.autopay_revoked_at IS NULL LOOP
  kind:=NULL;stage:=NULL;
  IF r.method_id IS NULL OR NOT coalesce(r.method_active,false) THEN kind:='method_missing';stage:=coalesce(r.security_payment_method_id::text,'none');title:='AutoPay payment method needs updating';detail:='The saved method is unavailable. Contact your provider to update it securely before the next payment.';
  ELSIF r.payment_type='card' THEN
   IF r.exp_month IS NULL OR r.exp_month NOT BETWEEN 1 AND 12 OR r.exp_year IS NULL OR r.exp_year NOT BETWEEN 2000 AND 9998 THEN kind:='method_missing';stage:=r.method_id::text;title:='AutoPay card needs verification';detail:='The saved card expiration could not be verified. Contact your provider to update it securely.';
   ELSE
    expiry:=(make_date(r.exp_year,r.exp_month,1)+interval '1 month')::date;days:=expiry-p_today;
    IF days<=30 THEN
     kind:=CASE WHEN days<=0 THEN 'card_expired' ELSE 'card_expiring' END;stage:=r.method_id::text||':'||expiry::text||':'||CASE WHEN days<=0 THEN 'expired' WHEN days<=7 THEN '7' ELSE '30' END;
     title:=CASE WHEN days<=0 THEN 'AutoPay card has expired' ELSE 'AutoPay card expires soon' END;
     detail:=CASE WHEN days<=0 THEN 'Your saved card has expired.' ELSE 'Your saved card expires at the end of '||to_char(expiry-1,'FMMonth YYYY')||'.' END||' Contact your provider to update it securely. Do not email card or bank details.';
    END IF;
   END IF;
  END IF;
  IF kind IS NOT NULL THEN a:=private.upsert_security_payment_alert(r.organization_id,r.id,NULL,'method:'||r.id::text||':'||stage,kind,title,detail);seen:=array_append(seen,a);END IF;
 END LOOP;
 FOR r IN SELECT b.*,i.amount_due,i.status invoice_status FROM public.security_billing_cycles b JOIN public.invoices i ON i.id=b.invoice_id AND i.organization_id=b.organization_id WHERE b.state IN ('declined','unknown','review','preparing','notice','ready','pending','processing') OR (b.state='paid' AND (b.accounting_synced_at IS NULL OR b.settlement_observation='unknown')) OR (b.returned_at IS NOT NULL AND b.returned_reviewed_at IS NULL) LOOP
  kind:=NULL;
  IF r.returned_at IS NOT NULL AND r.returned_reviewed_at IS NULL THEN kind:='payment_returned';title:='A previously received payment was returned';detail:='The payment provider reported a returned monitoring payment. Contact your provider to review it. Do not repeat the payment until the balance has been confirmed.';
  ELSIF r.state='paid' AND r.settlement_observation='unknown' THEN kind:='billing_blocked';title:='Received payment status check needs attention';detail:='The provider status of a previously received ACH payment could not be verified. Reconcile the merchant account; do not charge again.';
  ELSIF r.state='declined' AND r.amount_due>0 AND r.invoice_status IN ('submitted','partial','overdue') THEN kind:='payment_failed';title:='Automatic payment was not completed';detail:='Your automatic monitoring payment was declined or returned. Contact your provider to arrange payment or update the saved method. Your monitoring agreement remains in place. Do not email card or bank details.';
  ELSIF r.state='unknown' OR (r.state='processing' AND r.lease_until<now()) THEN kind:='payment_unknown';title:='AutoPay outcome needs reconciliation';detail:='The payment outcome is uncertain. Check the merchant account before retrying. This alert does not initiate another charge.';
  ELSIF r.state='review' OR (r.state IN ('preparing','notice','ready') AND r.last_message IS NOT NULL) OR (r.state IN ('preparing','notice') AND r.state_changed_at<now()-interval '1 hour') OR (r.state='ready' AND r.debit_after<now()-interval '1 hour') THEN kind:='billing_blocked';title:='Automatic billing needs attention';detail:='Invoice, notice, method or provider configuration needs staff review. Open the agreement billing history for details.';
  ELSIF r.state='pending' AND r.state_changed_at<now()-interval '3 days' THEN kind:='settlement_delayed';title:='Payment settlement is taking longer than expected';detail:='The provider has not confirmed completion after three days. Reconcile the existing transaction; do not charge again.';
  ELSIF r.state='paid' AND r.accounting_synced_at IS NULL AND r.state_changed_at<now()-interval '1 hour' THEN kind:='accounting_delayed';title:='Received payment needs accounting reconciliation';detail:='Payment was received but the QuickBooks accounting receipt has not synced. Do not collect it again.';
  END IF;
  IF kind IS NOT NULL THEN a:=private.upsert_security_payment_alert(r.organization_id,r.contract_id,r.id,'cycle:'||r.id::text||':'||r.attempt::text||':'||kind,kind,title,detail);seen:=array_append(seen,a);END IF;
 END LOOP;
 UPDATE public.security_payment_alerts SET resolved_at=now() WHERE resolved_at IS NULL AND NOT(id=ANY(seen));
 UPDATE public.security_payment_alert_deliveries d SET state='cancelled',lease_token=NULL,lease_until=NULL FROM public.security_payment_alerts a WHERE a.id=d.alert_id AND a.resolved_at IS NOT NULL AND d.state IN ('queued','sending');
 FOR r IN SELECT * FROM public.security_payment_alerts WHERE resolved_at IS NULL AND created_at<=now()-interval '3 days' LOOP
  reminder:=floor(extract(epoch FROM now()-r.created_at)/86400)::integer;
  INSERT INTO public.security_payment_alert_deliveries(alert_id,organization_id,audience,reminder) VALUES(r.id,r.organization_id,'staff',reminder) ON CONFLICT DO NOTHING;
  IF r.kind IN ('payment_failed','payment_returned') THEN reminder:=CASE WHEN reminder>=7 THEN 7 ELSE 3 END;INSERT INTO public.security_payment_alert_deliveries(alert_id,organization_id,audience,reminder) VALUES(r.id,r.organization_id,'customer',reminder) ON CONFLICT DO NOTHING;END IF;
 END LOOP;
 INSERT INTO public.security_payment_alert_health(organization_id,last_scan_at) SELECT DISTINCT organization_id,now() FROM public.security_contracts ON CONFLICT(organization_id) DO UPDATE SET last_scan_at=excluded.last_scan_at;
 RETURN jsonb_build_object('open',cardinality(seen));
END $$;
REVOKE ALL ON FUNCTION private.scan_security_payment_alerts(date) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.security_payment_alert_worker(p_action text,p_id uuid DEFAULT NULL,p_token uuid DEFAULT NULL,p_payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.security_payment_alert_deliveries%ROWTYPE;b public.security_billing_cycles%ROWTYPE;result jsonb;BEGIN
 IF p_action='settlement_lease' THEN
  SELECT * INTO b FROM public.security_billing_cycles WHERE state='paid' AND processor_payment_type='ach' AND nullif(processor_id,'') IS NOT NULL
   AND state_changed_at>now()-interval '90 days' AND settlement_check_due_at<=now() AND returned_at IS NULL AND (settlement_check_until IS NULL OR settlement_check_until<now())
   ORDER BY settlement_check_due_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF b.id IS NULL THEN RETURN NULL;END IF;
  UPDATE public.security_billing_cycles SET settlement_check_token=gen_random_uuid(),settlement_check_until=now()+interval '3 minutes' WHERE id=b.id RETURNING * INTO b;
  RETURN jsonb_build_object('id',b.id,'organization_id',b.organization_id,'processor_id',b.processor_id,'amount',b.amount,'lease_token',b.settlement_check_token);
 END IF;
 IF p_action='settlement_result' THEN
  SELECT * INTO b FROM public.security_billing_cycles WHERE id=p_id FOR UPDATE;
  IF b.id IS NULL OR p_token IS NULL OR b.settlement_check_token IS DISTINCT FROM p_token OR b.settlement_check_until IS NULL OR b.settlement_check_until<now() THEN RAISE EXCEPTION 'Settlement observation lease is invalid';END IF;
  IF p_payload->>'state' IS NULL OR p_payload->>'state' NOT IN ('paid','pending','declined','unknown') THEN RAISE EXCEPTION 'Invalid settlement observation';END IF;
  UPDATE public.security_billing_cycles SET settlement_observation=CASE WHEN p_payload->>'state' IN ('pending','unknown') THEN 'unknown' ELSE p_payload->>'state' END,
   returned_at=CASE WHEN p_payload->>'state'='declined' THEN coalesce(returned_at,now()) ELSE returned_at END,settlement_check_due_at=now()+interval '1 day',settlement_check_token=NULL,settlement_check_until=NULL WHERE id=b.id;
  RETURN jsonb_build_object('success',true);
 END IF;
 IF p_action='scan' THEN RETURN private.scan_security_payment_alerts();END IF;
 IF p_action='lease' THEN
  SELECT x.* INTO d FROM public.security_payment_alert_deliveries x JOIN public.security_payment_alerts a ON a.id=x.alert_id WHERE a.resolved_at IS NULL AND x.next_attempt_at<=now() AND (x.state='queued' OR x.state='sending' AND x.lease_until<now()) ORDER BY x.next_attempt_at,x.id FOR UPDATE OF x SKIP LOCKED LIMIT 1;
  IF d.id IS NULL THEN RETURN NULL;END IF;
  UPDATE public.security_payment_alert_deliveries SET state='sending',lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',attempts=attempts+1 WHERE id=d.id RETURNING * INTO d;
  SELECT jsonb_build_object('id',d.id,'lease_token',d.lease_token,'audience',d.audience,'reminder',d.reminder,'kind',a.kind,'title',a.title,'detail',a.detail,'contract_id',a.contract_id,'contract_number',c.contract_number,
   'to',CASE WHEN d.audience='customer' THEN coalesce(nullif(c.email_override,''),ct.email) ELSE coalesce(nullif(s.billing_alert_email,''),s.company_email) END,'from_email',s.from_email,'company_name',s.company_name,'from_name',s.from_name,'support_email',s.company_email,'subdomain',o.subdomain,'frozen_message',d.frozen_message) INTO result
   FROM public.security_payment_alerts a JOIN public.security_contracts c ON c.id=a.contract_id AND c.organization_id=a.organization_id JOIN public.contacts ct ON ct.id=c.contact_id AND ct.organization_id=c.organization_id JOIN public.organizations o ON o.id=a.organization_id LEFT JOIN public.company_settings s ON s.organization_id=a.organization_id WHERE a.id=d.alert_id;
  RETURN result;
 END IF;
 SELECT * INTO d FROM public.security_payment_alert_deliveries WHERE id=p_id FOR UPDATE;
 IF d.id IS NULL OR d.state<>'sending' OR p_token IS NULL OR d.lease_token IS DISTINCT FROM p_token OR d.lease_until IS NULL OR d.lease_until<now() THEN RAISE EXCEPTION 'Alert delivery lease is invalid';END IF;
 IF p_action='message' THEN
  IF jsonb_typeof(p_payload)<>'object' OR jsonb_typeof(p_payload->'to')<>'array' OR jsonb_array_length(p_payload->'to')<>1 THEN RAISE EXCEPTION 'Single-recipient message required';END IF;
  UPDATE public.security_payment_alert_deliveries SET frozen_message=coalesce(frozen_message,p_payload) WHERE id=d.id RETURNING frozen_message INTO result;RETURN result;
 ELSIF p_action='sent' THEN
  IF nullif(p_payload->>'provider_id','') IS NULL THEN RAISE EXCEPTION 'Email provider acceptance ID required';END IF;
  UPDATE public.security_payment_alert_deliveries SET state='sent',sent_at=now(),provider_id=left(p_payload->>'provider_id',200),lease_token=NULL,lease_until=NULL,last_error=NULL WHERE id=d.id;
 ELSIF p_action='failed' THEN
  UPDATE public.security_payment_alert_deliveries SET state='queued',lease_token=NULL,lease_until=NULL,next_attempt_at=now()+make_interval(mins=>least(1440,15*(2^least(d.attempts-1,7))::integer)),last_error=left(coalesce(p_payload->>'message','Email delivery needs review'),300) WHERE id=d.id;
 ELSE RAISE EXCEPTION 'Unsupported alert worker action';END IF;
 RETURN jsonb_build_object('success',true);
END $$;
REVOKE ALL ON FUNCTION public.security_payment_alert_worker(text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.security_payment_alert_worker(text,uuid,uuid,jsonb) TO service_role;
CREATE FUNCTION public.acknowledge_security_payment_alert(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.security_payment_alerts%ROWTYPE;BEGIN
 SELECT * INTO a FROM public.security_payment_alerts WHERE id=p_id FOR UPDATE;
 IF a.id IS NULL OR NOT private.security_payment_alert_access(a.organization_id) THEN RAISE EXCEPTION 'Billing alert permission required' USING ERRCODE='42501';END IF;
 UPDATE public.security_payment_alerts SET acknowledged_at=now(),acknowledged_by=auth.uid() WHERE id=a.id;
END $$;
REVOKE ALL ON FUNCTION public.acknowledge_security_payment_alert(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_security_payment_alert(uuid) TO authenticated;
CREATE FUNCTION private.security_payment_alert_notification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 INSERT INTO public.notifications(user_id,organization_id,type,title,body,related_id,is_read) SELECT p.id,NEW.organization_id,'system','Billing alert: '||NEW.title,NEW.detail||' Review Payment alerts in Contract Management.',NEW.contract_id,false FROM public.profiles p WHERE p.organization_id=NEW.organization_id AND p.is_active AND p.role IN ('admin','finance');RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.security_payment_alert_notification() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER security_payment_alert_notification AFTER INSERT ON public.security_payment_alerts FOR EACH ROW EXECUTE FUNCTION private.security_payment_alert_notification();
CREATE FUNCTION private.invoke_security_payment_alert_worker() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE endpoint text;credential text;BEGIN
 SELECT decrypted_secret INTO endpoint FROM vault.decrypted_secrets WHERE name='security_billing_project_url';SELECT decrypted_secret INTO credential FROM vault.decrypted_secrets WHERE name='security_billing_worker_secret';
 IF endpoint IS NULL OR endpoint !~ '^https://[a-z0-9]+\.supabase\.co$' OR credential IS NULL THEN RAISE EXCEPTION 'Configure payment alert worker endpoint and credential';END IF;
 RETURN net.http_post(url:=endpoint||'/functions/v1/security-payment-alerts',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||credential),body:='{}'::jsonb,timeout_milliseconds:=60000);
END $$;
REVOKE ALL ON FUNCTION private.invoke_security_payment_alert_worker() FROM PUBLIC,anon,authenticated,service_role;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM vault.secrets WHERE name='security_billing_project_url') THEN PERFORM cron.schedule('security-payment-alerts-every-15-minutes','*/15 * * * *','select private.invoke_security_payment_alert_worker();');END IF;END $$;
CREATE FUNCTION public.review_security_payment_return(p_cycle uuid,p_reason text,p_reconciled boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.security_billing_cycles%ROWTYPE;BEGIN
 SELECT * INTO b FROM public.security_billing_cycles WHERE id=p_cycle FOR UPDATE;
 IF b.id IS NULL OR NOT private.security_payment_alert_access(b.organization_id) THEN RAISE EXCEPTION 'Billing reconciliation permission required' USING ERRCODE='42501';END IF;
 IF b.returned_at IS NULL OR b.returned_reviewed_at IS NOT NULL THEN RAISE EXCEPTION 'An unreviewed returned payment is required';END IF;
 IF p_reconciled IS DISTINCT FROM true OR length(btrim(coalesce(p_reason,'')))<20 THEN RAISE EXCEPTION 'Confirm reconciliation and record the evidence';END IF;
 INSERT INTO public.security_billing_reviews(cycle_id,organization_id,actor_id,action,reason) VALUES(b.id,b.organization_id,auth.uid(),'return_reconciled',left(btrim(p_reason),1000));
 UPDATE public.security_billing_cycles SET returned_reviewed_at=now() WHERE id=b.id;
 UPDATE public.security_payment_alerts SET resolved_at=now() WHERE cycle_id=b.id AND kind='payment_returned' AND resolved_at IS NULL;
 UPDATE public.security_payment_alert_deliveries d SET state='cancelled',lease_token=NULL,lease_until=NULL FROM public.security_payment_alerts a WHERE a.id=d.alert_id AND a.cycle_id=b.id AND a.resolved_at IS NOT NULL AND d.state IN ('queued','sending');
 -- Staff must separately correct the payment/invoice/accounting/commission records. This attestation never changes money.
END $$;
REVOKE ALL ON FUNCTION public.review_security_payment_return(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_security_payment_return(uuid,text,boolean) TO authenticated;
CREATE FUNCTION private.invoke_security_settlement_watch() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE endpoint text;credential text;BEGIN
 SELECT decrypted_secret INTO endpoint FROM vault.decrypted_secrets WHERE name='security_billing_project_url';SELECT decrypted_secret INTO credential FROM vault.decrypted_secrets WHERE name='security_billing_worker_secret';
 IF endpoint IS NULL OR endpoint !~ '^https://[a-z0-9]+\.supabase\.co$' OR credential IS NULL THEN RAISE EXCEPTION 'Configure settlement watch endpoint and credential';END IF;
 RETURN net.http_post(url:=endpoint||'/functions/v1/security-payment-settlement-watch',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||credential),body:='{}'::jsonb,timeout_milliseconds:=60000);
END $$;
REVOKE ALL ON FUNCTION private.invoke_security_settlement_watch() FROM PUBLIC,anon,authenticated,service_role;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM vault.secrets WHERE name='security_billing_project_url') THEN PERFORM cron.schedule('security-payment-settlement-watch-every-15-minutes','*/15 * * * *','select private.invoke_security_settlement_watch();');END IF;END $$;
-- New AutoPay activations require an operating alert scan, not just a configured sender.
CREATE FUNCTION private.security_payment_alert_readiness() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NEW.status='active' AND OLD.status IS DISTINCT FROM 'active' AND NEW.security_billing_mode='autopay' AND NEW.onboarding_agreement_snapshot IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='security-payment-alerts-every-15-minutes' AND active)
   OR NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='security-payment-settlement-watch-every-15-minutes' AND active)
   OR NOT EXISTS(SELECT 1 FROM public.security_payment_alert_health WHERE organization_id=NEW.organization_id AND last_scan_at>now()-interval '1 hour') THEN
   RAISE EXCEPTION 'Enable the payment alert and settlement watch jobs and complete an alert scan before AutoPay activation';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.security_payment_alert_readiness() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER security_payment_alert_readiness BEFORE UPDATE ON public.security_contracts FOR EACH ROW EXECUTE FUNCTION private.security_payment_alert_readiness();
