-- Keep scheduled dates and actual receipts distinct, including manually recorded invoice payments.
CREATE OR REPLACE FUNCTION private.security_billing_schedule_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF (NEW.monitoring_start_date IS DISTINCT FROM OLD.monitoring_start_date OR NEW.first_payment_date IS DISTINCT FROM OLD.first_payment_date)
    AND NOT (OLD.status='approved' AND NEW.status='active' AND current_setting('mjv.security_signing',true)='true') THEN
    RAISE EXCEPTION 'Activation dates are set by authorized staff during activation';
  END IF;
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
    IF NEW.monitoring_start_date IS NULL OR NEW.first_payment_date IS NULL THEN RAISE EXCEPTION 'Set monitoring start and first payment dates'; END IF;
    IF NEW.monitoring_start_date < (now() AT TIME ZONE 'America/Chicago')::date-31 THEN RAISE EXCEPTION 'Monitoring start is more than 31 days ago; review historical billing before activation'; END IF;
    IF NEW.first_payment_date < NEW.monitoring_start_date THEN RAISE EXCEPTION 'First payment cannot precede monitoring start'; END IF;
    IF NEW.first_payment_date < (now() AT TIME ZONE 'America/Chicago')::date+10 THEN RAISE EXCEPTION 'Allow at least 10 days for the first payment notice'; END IF;
    NEW.security_billing_anchor := NEW.monitoring_start_date;
    NEW.security_billing_period := 0;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION private.security_contract_summary(p_contract uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.security_contracts%ROWTYPE; v_start date; v_end date; v_today date := (now() AT TIME ZONE 'America/Chicago')::date;
  v_term integer; v_age interval; v_remaining integer; v_due numeric; v_pending numeric; v_next timestamptz;
BEGIN
 SELECT * INTO c FROM public.security_contracts WHERE id=p_contract;
 v_start := coalesce(c.monitoring_start_date,c.security_billing_anchor,(c.activated_at AT TIME ZONE 'America/Chicago')::date);
 v_term := coalesce((c.onboarding_agreement_snapshot->>'term_months')::integer,c.term_months);
 IF v_start IS NOT NULL THEN
   v_end := private.security_period_date(v_start,v_term,1);
   v_age := age(v_end,v_today);
   v_remaining := least(v_term,greatest(0,extract(year from v_age)::integer*12+extract(month from v_age)::integer+CASE WHEN extract(day from v_age)>0 THEN 1 ELSE 0 END));
 END IF;
 IF c.status='cancelled' THEN v_remaining := 0; END IF;
 SELECT coalesce(sum(greatest(i.amount_due,0)),0) INTO v_due
   FROM public.security_billing_cycles b JOIN public.invoices i ON i.id=b.invoice_id
   WHERE b.contract_id=c.id AND i.status IN ('submitted','partial','overdue','paid');
 SELECT coalesce(sum(amount),0) INTO v_pending FROM public.security_billing_cycles WHERE contract_id=c.id AND state IN ('processing','pending','unknown');
 SELECT min(debit_after) INTO v_next FROM public.security_billing_cycles WHERE contract_id=c.id AND state IN ('ready','processing','pending');
 IF c.status<>'active' OR c.autopay_paused OR c.autopay_revoked_at IS NOT NULL THEN v_next := NULL; END IF;
 RETURN jsonb_build_object(
   'monthly_price',coalesce((c.onboarding_agreement_snapshot->>'monthly_price')::numeric,c.monthly_price),
   'amount_due',CASE WHEN c.status='active' AND c.security_billing_anchor IS NULL AND NOT EXISTS(SELECT 1 FROM public.security_billing_cycles WHERE contract_id=c.id) THEN NULL ELSE v_due END,
   'first_payment_date',c.first_payment_date,
   'first_payment_made_at',(SELECT min(p.created_at) FROM public.payments p JOIN public.security_billing_cycles b ON b.invoice_id=p.invoice_id WHERE b.contract_id=c.id AND p.amount>0),
   'pending_payment_amount',v_pending,'start_date',v_start,'initial_term_end',v_end,'term_months',v_term,
   'months_remaining',v_remaining,'initial_term_complete',v_end IS NOT NULL AND v_end<=v_today,
   'renewal_term_months',coalesce((c.onboarding_agreement_snapshot->>'renewal_term_months')::integer,c.renewal_term_months),
   'next_debit_at',v_next,'billing_frequency',coalesce(c.onboarding_agreement_snapshot->>'billingPreference',CASE WHEN c.billing_frequency_override='yearly' THEN 'annual' ELSE 'monthly' END),
   'billing_mode',c.security_billing_mode,'mail_invoice_fee',c.mail_invoice_fee,'autopay_paused',c.autopay_paused,'autopay_revoked_at',c.autopay_revoked_at,
   'latest_billing_status',(SELECT state FROM public.security_billing_cycles WHERE contract_id=c.id ORDER BY period_index DESC LIMIT 1),
   'invoices',coalesce((SELECT jsonb_agg(jsonb_build_object('number',i.invoice_number,'status',i.status,'total',i.total,'amount_due',i.amount_due,'due_date',i.due_date,'payment_status',b.state)
     ORDER BY b.period_start DESC) FROM public.security_billing_cycles b JOIN public.invoices i ON i.id=b.invoice_id
     WHERE b.contract_id=c.id AND i.status IN ('submitted','partial','paid','overdue')), '[]'::jsonb)
 );
END $$;
CREATE OR REPLACE FUNCTION private.security_autopay_authorization()
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 'I authorize MyJobView to initiate recurring automatic charges or ACH debits through QuickBooks Payments to my selected payment method for security monitoring, at the billing frequency and amounts shown in this agreement, plus applicable taxes disclosed on invoices. The provider sets the monitoring start date and first scheduled payment after installation and account setup. Completing this form does not activate monitoring or start billing. Invoices identify the payment amount and scheduled debit date and are sent at least 10 days before an automatic debit; delayed notice delays the debit. Monthly or annual monitoring periods recur from the provider-set monitoring start date, and scheduled payments recur from the first payment date; short months use the last day of the month. This authorization continues until revoked. Contact the provider using the contact information in this agreement to revoke or change payment authorization before the next scheduled payment. Revoking AutoPay does not cancel the monitoring agreement or amounts owed.'::text; $$;
