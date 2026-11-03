-- Supply the production invoice schema requirements even when the scheduler has no user JWT.
CREATE OR REPLACE FUNCTION private.security_recurring_billing(p_action text,p_id uuid,p_payload jsonb)
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
      IF v_start>v_today+10 OR v_start<v_today-31 THEN CONTINUE; END IF; -- No silent historical catch-up charges.
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
      INSERT INTO public.invoices(invoice_number,created_by,company_id,organization_id,contact_id,invoice_date,due_date,invoice_type,source_type,
        status,subtotal,total,amount_due,billing_name,billing_address_line1,billing_city,billing_state,billing_zip,
        jobsite_address,jobsite_city,jobsite_state,jobsite_zip,tax_environment,tax_project_type,notes)
      SELECT public.generate_invoice_number(),coalesce(c.approved_by_user_id,c.created_by_user_id),c.organization_id,c.organization_id,c.contact_id,v_start,private.security_period_date(coalesce(c.first_payment_date,c.security_billing_anchor+10),c.security_billing_period,v_months),'recurring','manual','draft',v_subtotal-v_discount,v_subtotal-v_discount,v_subtotal-v_discount,
        ct.full_name,ct.street_address,ct.city,ct.state,ct.zip_code,
        c.onboarding_agreement_snapshot->'propertyInfo'->>'address_line1',c.onboarding_agreement_snapshot->'propertyInfo'->>'city',
        c.onboarding_agreement_snapshot->'propertyInfo'->>'state',c.onboarding_agreement_snapshot->'propertyInfo'->>'zip_code',
        coalesce(ct.tax_environment,'residential'),'security_monitoring',
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
