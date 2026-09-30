-- MyJobView owns billing cadence. Only new, portal-signed monitoring agreements
-- acquire a schedule; historical active accounts are never automatically backfilled.
ALTER TABLE public.security_contracts ADD COLUMN security_billing_anchor date;
ALTER TABLE public.security_contracts ADD COLUMN security_billing_period integer NOT NULL DEFAULT 0;
ALTER TABLE public.security_contracts ADD COLUMN autopay_paused boolean NOT NULL DEFAULT false;
ALTER TABLE public.security_contracts ADD COLUMN autopay_revoked_at timestamptz;
ALTER TABLE public.security_contracts ADD COLUMN monitoring_tax_classification_id uuid REFERENCES public.tax_classifications(id);
ALTER TABLE public.quickbooks_settings ADD COLUMN security_monitoring_item_id text;

CREATE TABLE public.security_billing_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.security_contracts(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  period_index integer NOT NULL, period_start date NOT NULL, period_end date NOT NULL,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  billing_mode text NOT NULL CHECK(billing_mode IN ('autopay','mail')),
  state text NOT NULL DEFAULT 'preparing' CHECK(state IN ('preparing','notice','ready','processing','pending','paid','declined','unknown','review','mail','cancelled')),
  amount numeric, notice_sent_at timestamptz, debit_after timestamptz,
  lease_token uuid, lease_until timestamptz, next_check_at timestamptz NOT NULL DEFAULT now(),
  attempt integer NOT NULL DEFAULT 0, request_id uuid, processor_id text, processor_status text,
  qbo_payment_id text, accounting_synced_at timestamptz, last_message text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contract_id,period_index)
);
CREATE INDEX security_billing_work_idx ON public.security_billing_cycles(state,next_check_at);
CREATE INDEX security_billing_org_idx ON public.security_billing_cycles(organization_id,created_at);
ALTER TABLE public.security_billing_cycles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_billing_cycles FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.security_billing_cycles TO authenticated;
GRANT ALL ON public.security_billing_cycles TO service_role;
CREATE POLICY security_billing_staff_read ON public.security_billing_cycles FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=security_billing_cycles.organization_id AND p.role IN ('admin','finance')));
ALTER TABLE public.invoices ADD COLUMN security_billing_cycle_id uuid UNIQUE REFERENCES public.security_billing_cycles(id);
ALTER TABLE public.payments ADD COLUMN security_billing_cycle_id uuid UNIQUE REFERENCES public.security_billing_cycles(id);

CREATE FUNCTION private.security_period_date(anchor date, period_index integer, months integer)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT (date_trunc('month',anchor)::date + make_interval(months=>period_index*months)
    + make_interval(days=>least(extract(day from anchor)::integer,extract(day from date_trunc('month',anchor) + make_interval(months=>period_index*months+1) - interval '1 day')::integer)-1))::date;
$$;
REVOKE ALL ON FUNCTION private.security_period_date(date,integer,integer) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.security_billing_schedule_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF current_setting('mjv.security_billing',true) IS DISTINCT FROM 'true'
    AND (NEW.security_billing_anchor IS DISTINCT FROM OLD.security_billing_anchor OR NEW.security_billing_period IS DISTINCT FROM OLD.security_billing_period) THEN
    RAISE EXCEPTION 'Billing schedules are managed by the recurring billing workflow';
  END IF;
  IF OLD.autopay_revoked_at IS NOT NULL AND (NEW.autopay_revoked_at IS DISTINCT FROM OLD.autopay_revoked_at OR NOT NEW.autopay_paused) THEN
    RAISE EXCEPTION 'A new payment authorization is required after revocation';
  END IF;
  IF NEW.monitoring_tax_classification_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tax_classifications t
    WHERE t.id=NEW.monitoring_tax_classification_id AND t.organization_id=NEW.organization_id AND t.is_active) THEN
    RAISE EXCEPTION 'Choose an active tax classification for this organization';
  END IF;
  IF NEW.status='active' AND OLD.status IS DISTINCT FROM 'active' AND NEW.onboarding_agreement_snapshot IS NOT NULL
    AND coalesce(NEW.agreement_type,'monitoring')='monitoring' AND NEW.security_billing_anchor IS NULL THEN
    IF NEW.subscription_id IS NOT NULL THEN RAISE EXCEPTION 'Resolve the existing recurring subscription before enabling security billing'; END IF;
    IF NEW.monitoring_tax_classification_id IS NULL THEN RAISE EXCEPTION 'Select the monitoring tax classification before activation'; END IF;
    IF NEW.security_billing_mode='autopay' AND NEW.autopay_paused THEN RAISE EXCEPTION 'AutoPay has been paused or revoked'; END IF;
    NEW.security_billing_anchor := (coalesce(NEW.activated_at,now()) AT TIME ZONE 'America/Chicago')::date;
    NEW.security_billing_period := 0;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.security_billing_schedule_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER security_billing_schedule_guard BEFORE UPDATE ON public.security_contracts FOR EACH ROW EXECUTE FUNCTION private.security_billing_schedule_guard();

CREATE FUNCTION private.security_recurring_billing(p_action text,p_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  c public.security_contracts%ROWTYPE; b public.security_billing_cycles%ROWTYPE; i public.invoices%ROWTYPE;
  m public.security_payment_methods%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'America/Chicago')::date;
  v_start date; v_end date; v_months integer; v_invoice uuid; v_cycle uuid;
  v_subtotal numeric; v_fee numeric; v_discount numeric; v_calc jsonb; v_submit jsonb;
  v_count integer := 0; v_state text; v_number text;
BEGIN
  IF p_action='generate' THEN
    FOR c IN SELECT * FROM public.security_contracts WHERE status='active' AND security_billing_anchor IS NOT NULL
      AND onboarding_agreement_snapshot IS NOT NULL AND coalesce(agreement_type,'monitoring')='monitoring' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 100 LOOP
      v_months := CASE WHEN c.onboarding_agreement_snapshot->>'billingPreference'='annual' THEN 12 ELSE 1 END;
      v_start := private.security_period_date(c.security_billing_anchor,c.security_billing_period,v_months);
      v_end := private.security_period_date(c.security_billing_anchor,c.security_billing_period+1,v_months)-1;
      IF v_start>v_today OR v_start<v_today-31 THEN CONTINUE; END IF; -- No silent historical catch-up charges.
      IF EXISTS(SELECT 1 FROM public.security_billing_cycles WHERE contract_id=c.id AND period_index=c.security_billing_period) THEN CONTINUE; END IF;
      v_subtotal := (c.onboarding_agreement_snapshot->>'monthly_price')::numeric*v_months;
      v_fee := coalesce((c.onboarding_agreement_snapshot->>'mail_invoice_fee')::numeric,0)*v_months;
      v_discount := 0;
      IF v_months=12 THEN
        IF c.onboarding_agreement_snapshot->'dealer'->>'annual_discount_type'='percentage' THEN
          v_discount := round((v_subtotal-v_fee)*coalesce((c.onboarding_agreement_snapshot->'dealer'->>'annual_discount_percentage')::numeric,0)/100,2);
        ELSE v_discount := least(v_subtotal-v_fee,coalesce((c.onboarding_agreement_snapshot->'dealer'->>'annual_discount_flat_amount')::numeric,0)); END IF;
      END IF;
      IF v_subtotal-v_discount<=0 THEN CONTINUE; END IF;
      INSERT INTO public.invoices(company_id,organization_id,contact_id,invoice_date,due_date,invoice_type,source_type,
        status,subtotal,total,amount_due,billing_name,billing_address_line1,billing_city,billing_state,billing_zip,
        jobsite_address,jobsite_city,jobsite_state,jobsite_zip,tax_environment,tax_project_type,notes)
      SELECT c.organization_id,c.organization_id,c.contact_id,v_start,v_start+10,'recurring','manual','draft',v_subtotal-v_discount,v_subtotal-v_discount,v_subtotal-v_discount,
        ct.full_name,ct.street_address,ct.city,ct.state,ct.zip_code,
        c.onboarding_agreement_snapshot->'propertyInfo'->>'address_line1',c.onboarding_agreement_snapshot->'propertyInfo'->>'city',
        c.onboarding_agreement_snapshot->'propertyInfo'->>'state',c.onboarding_agreement_snapshot->'propertyInfo'->>'zip_code',
        coalesce(ct.tax_environment,'residential'),'general_installation_repair',
        'Security monitoring '||c.contract_number||' · '||v_start||' through '||v_end
      FROM public.contacts ct WHERE ct.id=c.contact_id AND ct.organization_id=c.organization_id RETURNING id INTO v_invoice;
      INSERT INTO public.invoice_line_items(invoice_id,organization_id,description,quantity,unit_price,amount,sort_order,item_type,is_taxable,tax_classification_id)
        VALUES(v_invoice,c.organization_id,'Security monitoring '||c.contract_number,1,v_subtotal-v_fee-v_discount,v_subtotal-v_fee-v_discount,1,'labor',true,c.monitoring_tax_classification_id);
      IF v_fee>0 THEN
        INSERT INTO public.invoice_line_items(invoice_id,organization_id,description,quantity,unit_price,amount,sort_order,item_type,is_taxable,tax_classification_id)
          VALUES(v_invoice,c.organization_id,'Admin-approved mailed invoices ($7 per month)',v_months,7,v_fee,2,'labor',true,c.monitoring_tax_classification_id);
      END IF;
      INSERT INTO public.security_billing_cycles(contract_id,organization_id,period_index,period_start,period_end,invoice_id,billing_mode)
        VALUES(c.id,c.organization_id,c.security_billing_period,v_start,v_end,v_invoice,c.security_billing_mode) RETURNING id INTO v_cycle;
      UPDATE public.invoices SET security_billing_cycle_id=v_cycle WHERE id=v_invoice;
      PERFORM set_config('mjv.security_billing','true',true);
      UPDATE public.security_contracts SET security_billing_period=security_billing_period+1 WHERE id=c.id;
      PERFORM set_config('mjv.security_billing','false',true);
      v_count := v_count+1;
    END LOOP;
    RETURN jsonb_build_object('generated',v_count);
  END IF;
  IF p_action='lease' THEN
    -- A crash during the POST is an unknown outcome, never permission to POST again.
    UPDATE public.security_billing_cycles SET state='unknown',last_message='Processing lease expired; reconcile the provider transaction before retrying',lease_token=NULL,lease_until=NULL
      WHERE state='processing' AND lease_until<now();
    SELECT * INTO b FROM public.security_billing_cycles WHERE next_check_at<=now()
      AND (lease_until IS NULL OR lease_until<now())
      AND (state IN ('preparing','notice','pending') OR (state='ready' AND debit_after<=now()) OR (state='paid' AND accounting_synced_at IS NULL))
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
    IF b.id IS NULL THEN RETURN NULL; END IF;
    UPDATE public.security_billing_cycles SET lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',updated_at=now()
      WHERE id=b.id RETURNING * INTO b;
    RETURN to_jsonb(b);
  END IF;
  SELECT * INTO b FROM public.security_billing_cycles WHERE id=p_id FOR UPDATE;
  IF b.id IS NULL OR b.lease_token IS NULL OR b.lease_until IS NULL OR b.lease_token IS DISTINCT FROM (p_payload->>'lease_token')::uuid OR b.lease_until<now() THEN
    RAISE EXCEPTION 'Billing lease is invalid or expired';
  END IF;
  SELECT * INTO c FROM public.security_contracts WHERE id=b.contract_id FOR UPDATE;
  SELECT * INTO i FROM public.invoices WHERE id=b.invoice_id FOR UPDATE;
  IF p_action='prepare' THEN
    IF b.state<>'preparing' THEN RAISE EXCEPTION 'Invoice preparation is not available'; END IF;
    IF i.status='draft' THEN
      v_calc := public.calculate_tax_context('invoice',i.id);
      IF coalesce(v_calc->>'tax_calculation_status','review_required') NOT IN ('ready','exempt','not_collecting') THEN
        UPDATE public.security_billing_cycles SET state='review',last_message='Invoice tax configuration requires review',lease_token=NULL,lease_until=NULL WHERE id=b.id;
        RETURN jsonb_build_object('ready',false);
      END IF;
      v_submit := public.submit_invoice(i.id);
      IF coalesce(v_submit->>'success','false')<>'true' THEN RAISE EXCEPTION 'Invoice submission failed: %',v_submit->'errors'; END IF;
    END IF;
    SELECT * INTO i FROM public.invoices WHERE id=b.invoice_id;
    UPDATE public.security_billing_cycles SET amount=i.amount_due,state=CASE WHEN b.billing_mode='mail' THEN 'mail' ELSE 'notice' END,
      lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=b.id;
    RETURN jsonb_build_object('ready',true);
  END IF;
  IF p_action='notice' THEN
    IF b.state<>'notice' OR i.amount_due<>b.amount OR i.status NOT IN ('submitted','partial','overdue') THEN RAISE EXCEPTION 'Invoice changed before notice'; END IF;
    UPDATE public.security_billing_cycles SET state='ready',notice_sent_at=now(),debit_after=greatest((i.due_date::timestamp AT TIME ZONE 'America/Chicago'),now()+interval '10 days'),
      lease_token=NULL,lease_until=NULL,last_message=NULL,updated_at=now() WHERE id=b.id;
    RETURN jsonb_build_object('success',true);
  END IF;
  IF p_action='charge' THEN
    IF b.state<>'ready' OR b.debit_after>now() OR b.notice_sent_at>now()-interval '10 days' THEN RAISE EXCEPTION 'Advance notice is required before charging'; END IF;
    IF c.status<>'active' OR c.autopay_paused OR c.autopay_revoked_at IS NOT NULL OR c.autopay_authorized_at IS NULL THEN
      UPDATE public.security_billing_cycles SET state='cancelled',last_message='Agreement is inactive or AutoPay has been revoked',lease_token=NULL,lease_until=NULL WHERE id=b.id;
      RETURN NULL;
    END IF;
    IF i.amount_due<>b.amount OR i.status NOT IN ('submitted','partial','overdue') THEN
      UPDATE public.security_billing_cycles SET state='review',last_message='Invoice balance changed; no charge attempted',lease_token=NULL,lease_until=NULL WHERE id=b.id;
      RETURN NULL;
    END IF;
    SELECT * INTO m FROM public.security_payment_methods WHERE id=c.security_payment_method_id AND contact_id=c.contact_id AND organization_id=c.organization_id AND is_active;
    IF m.id IS NULL THEN RAISE EXCEPTION 'Verified payment method is unavailable'; END IF;
    UPDATE public.security_billing_cycles SET state='processing',attempt=attempt+1,request_id=gen_random_uuid(),updated_at=now() WHERE id=b.id RETURNING * INTO b;
    RETURN jsonb_build_object('cycle',to_jsonb(b),'method',to_jsonb(m));
  END IF;
  IF p_action='result' THEN
    IF b.state NOT IN ('processing','pending') THEN RAISE EXCEPTION 'Payment result cannot be recorded'; END IF;
    v_state := p_payload->>'state';
    IF v_state NOT IN ('paid','pending','declined','unknown') THEN RAISE EXCEPTION 'Invalid payment outcome'; END IF;
    IF v_state IN ('paid','pending') AND nullif(p_payload->>'processor_id','') IS NULL THEN RAISE EXCEPTION 'Processor transaction ID is required'; END IF;
    UPDATE public.security_billing_cycles SET state=v_state,processor_id=coalesce(nullif(p_payload->>'processor_id',''),processor_id),
      processor_status=left(p_payload->>'processor_status',50),last_message=left(p_payload->>'message',300),
      next_check_at=CASE WHEN v_state='pending' THEN now()+interval '1 hour' ELSE now() END,
      lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=b.id;
    IF v_state='paid' THEN
      PERFORM set_config('mjv.security_payment_recording','true',true);
      INSERT INTO public.payments(company_id,organization_id,invoice_id,amount,payment_method,payment_processor,processor_transaction_id,reference_number,security_billing_cycle_id,notes)
        VALUES(c.organization_id,c.organization_id,i.id,b.amount,'qbo_payments','quickbooks',p_payload->>'processor_id',p_payload->>'processor_id',b.id,'Automatic security monitoring payment')
        ON CONFLICT(security_billing_cycle_id) DO NOTHING;
      PERFORM set_config('mjv.security_payment_recording','false',true);
    END IF;
    RETURN jsonb_build_object('success',true);
  END IF;
  IF p_action='accounting' THEN
    IF b.state<>'paid' OR nullif(p_payload->>'qbo_payment_id','') IS NULL THEN RAISE EXCEPTION 'A verified accounting payment is required'; END IF;
    UPDATE public.security_billing_cycles SET qbo_payment_id=p_payload->>'qbo_payment_id',accounting_synced_at=now(),lease_token=NULL,lease_until=NULL,last_message=NULL WHERE id=b.id;
    UPDATE public.payments SET qbo_payment_id=p_payload->>'qbo_payment_id',synced_at=now() WHERE security_billing_cycle_id=b.id;
    RETURN jsonb_build_object('success',true);
  END IF;
  IF p_action='defer' THEN
    UPDATE public.security_billing_cycles SET state=CASE WHEN state='processing' THEN 'unknown' ELSE state END,
      lease_token=NULL,lease_until=NULL,next_check_at=now()+interval '1 hour',last_message=left(p_payload->>'message',300),updated_at=now() WHERE id=b.id;
    RETURN jsonb_build_object('success',true);
  END IF;
  RAISE EXCEPTION 'Unsupported billing operation';
END $$;
REVOKE ALL ON FUNCTION private.security_recurring_billing(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT EXECUTE ON FUNCTION private.security_recurring_billing(text,uuid,jsonb) TO service_role;
CREATE FUNCTION public.security_recurring_billing(p_action text,p_id uuid DEFAULT NULL,p_payload jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.security_recurring_billing(p_action,p_id,p_payload); $$;
REVOKE ALL ON FUNCTION public.security_recurring_billing(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.security_recurring_billing(text,uuid,jsonb) TO service_role;

CREATE FUNCTION private.security_invoice_payment_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  -- The accounting webhook may arrive before the worker records the QBO payment ID.
  -- Match its provider reference to the already-recorded charge instead of inserting twice.
  IF NEW.qbo_payment_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.security_billing_cycles b
    WHERE b.invoice_id=NEW.invoice_id AND b.state='paid' AND b.processor_id=NEW.reference_number) THEN
    UPDATE public.payments SET qbo_payment_id=NEW.qbo_payment_id,synced_at=now()
      WHERE security_billing_cycle_id=(SELECT id FROM public.security_billing_cycles WHERE invoice_id=NEW.invoice_id AND processor_id=NEW.reference_number LIMIT 1);
    RETURN NULL;
  END IF;
  IF current_setting('mjv.security_payment_recording',true) IS DISTINCT FROM 'true' AND EXISTS(
    SELECT 1 FROM public.security_billing_cycles WHERE invoice_id=NEW.invoice_id AND state IN ('processing','pending','unknown')
  ) THEN RAISE EXCEPTION 'An automatic payment is in progress or unresolved. Reconcile it before recording another payment.'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.security_invoice_payment_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER security_invoice_payment_guard BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION private.security_invoice_payment_guard();

-- The legacy activation trigger must not also create an independently scheduled
-- subscription for the same portal-signed monitoring agreement.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.security_contracts'::regclass AND tgname='trigger_create_subscription_from_contract') THEN
   DROP TRIGGER trigger_create_subscription_from_contract ON public.security_contracts;
   CREATE TRIGGER trigger_create_subscription_from_contract BEFORE UPDATE ON public.security_contracts
     FOR EACH ROW WHEN (NEW.status='active' AND OLD.status IS DISTINCT FROM 'active'
       AND (NEW.onboarding_agreement_snapshot IS NULL OR coalesce(NEW.agreement_type,'monitoring')<>'monitoring'))
     EXECUTE FUNCTION public.create_subscription_from_contract();
 END IF;
END $$;
