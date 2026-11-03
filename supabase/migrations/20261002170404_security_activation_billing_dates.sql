-- Staff schedules monitoring and payment after customer completion. No historical account backfill.
ALTER TABLE public.security_contracts ADD COLUMN monitoring_start_date date;
ALTER TABLE public.security_contracts ADD COLUMN first_payment_date date;
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
    IF NEW.first_payment_date < NEW.monitoring_start_date THEN RAISE EXCEPTION 'First payment cannot precede monitoring start'; END IF;
    IF NEW.first_payment_date < (now() AT TIME ZONE 'America/Chicago')::date+10 THEN RAISE EXCEPTION 'Allow at least 10 days for the first payment notice'; END IF;
    NEW.security_billing_anchor := NEW.monitoring_start_date;
    NEW.security_billing_period := 0;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION private.staff_security_onboarding(p_action text,p_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.security_contracts%ROWTYPE; actor public.profiles%ROWTYPE; cid uuid; req uuid; services uuid[];
 total numeric; override numeric; f jsonb; d jsonb; e jsonb; ord bigint; m public.security_payment_methods%ROWTYPE;
 ct public.contacts%ROWTYPE; office uuid; BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=auth.uid();
 IF NOT private.security_staff_access(actor.organization_id,p_action IN ('approve','activate','reject','review')) THEN
  RAISE EXCEPTION 'Security onboarding permission is required' USING ERRCODE='42501'; END IF;
 IF p_action='create' THEN
  req:=(p_payload->>'request_id')::uuid;
  IF req IS NULL THEN RAISE EXCEPTION 'Creation request ID is required'; END IF;
  -- Serialize retries before any contact/service writes.
  PERFORM pg_advisory_xact_lock(hashtextextended(actor.organization_id::text||req::text,0));
  SELECT * INTO c FROM public.security_contracts WHERE organization_id=actor.organization_id AND creation_request_id=req;
  IF c.id IS NOT NULL THEN RETURN jsonb_build_object('id',c.id); END IF;
 ELSIF p_action<>'print_form' THEN
  SELECT * INTO c FROM public.security_contracts WHERE id=p_id AND organization_id=actor.organization_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Agreement not found' USING ERRCODE='42501'; END IF;
 END IF;
 IF p_action IN ('get','review') THEN RETURN jsonb_build_object('id',c.id,'status',c.status,'customer_completed_at',c.customer_completed_at,'summary',private.security_contract_summary(c.id),'document',private.security_staff_document(c.id),'document_version',md5(private.security_staff_document(c.id)::text)); END IF;
 IF p_action IN ('create','edit','print_form') THEN
  IF p_action='edit' AND (c.customer_completed_at IS NOT NULL OR c.status NOT IN ('draft','pending_customer','rejected')) THEN RAISE EXCEPTION 'Signed agreements cannot be edited; use an amendment'; END IF;
  IF nullif(p_payload->>'term_months','') IS NULL OR (p_payload->>'term_months')::integer NOT IN (12,24,36,48,60) THEN RAISE EXCEPTION 'Choose a supported initial term'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.security_contract_templates t WHERE t.id=coalesce((p_payload->>'template_id')::uuid,c.template_id) AND t.organization_id=actor.organization_id AND t.is_active AND t.contract_terms NOT LIKE '%[LEGAL REVIEW:%') THEN RAISE EXCEPTION 'Choose an active, reviewed agreement template'; END IF;
  SELECT coalesce(array_agg(DISTINCT v::uuid),'{}') INTO services FROM jsonb_array_elements_text(coalesce(p_payload->'service_ids','[]')) x(v);
  IF cardinality(services)=0 THEN RAISE EXCEPTION 'Choose at least one monitoring service'; END IF;
  IF (SELECT count(*) FROM public.monitoring_services WHERE id=ANY(services) AND organization_id=actor.organization_id AND is_active)<>cardinality(services) THEN RAISE EXCEPTION 'Choose active services from this organization'; END IF;
  SELECT sum(monthly_price) INTO total FROM public.monitoring_services WHERE id=ANY(services);
  override:=nullif(p_payload->>'price_override','')::numeric;
  total:=coalesce(override,total);
  IF total IS NULL OR total<0 OR total>1000000 THEN RAISE EXCEPTION 'Enter a valid monthly price'; END IF;
  IF p_action='print_form' THEN
   RETURN jsonb_build_object('term_months',(p_payload->>'term_months')::integer,'renewal_term_months',1,'cancellation_notice_days',30,'monthly_price',total,
    'template',(SELECT jsonb_build_object('name',t.name,'contract_terms',t.contract_terms) FROM public.security_contract_templates t WHERE t.id=(p_payload->>'template_id')::uuid),
    'services',(SELECT jsonb_agg(jsonb_build_object('name',svc.name,'monthly_price',svc.monthly_price) ORDER BY svc.name) FROM public.monitoring_services svc WHERE svc.id=ANY(services)),
    'autopay_authorization',private.security_autopay_authorization(),
    'dealer',(SELECT jsonb_build_object('company_name',s.company_name,'company_email',s.company_email,'annual_billing_enabled',s.annual_billing_enabled,'annual_discount_type',s.annual_discount_type,'annual_discount_percentage',s.annual_discount_percentage,'annual_discount_flat_amount',s.annual_discount_flat_amount) FROM public.company_settings s WHERE s.organization_id=actor.organization_id LIMIT 1));
  END IF;
  IF nullif(p_payload->>'email_override','') IS NOT NULL AND p_payload->>'email_override' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Enter a valid invitation email'; END IF;
  cid:=nullif(p_payload->>'contact_id','')::uuid;
  IF cid IS NULL THEN
   IF p_action<>'create' OR p_payload->'new_contact' IS NULL THEN RAISE EXCEPTION 'Choose a customer'; END IF;
   f:=p_payload->'new_contact';
   IF nullif(btrim(f->>'first_name'),'') IS NULL OR nullif(btrim(f->>'last_name'),'') IS NULL OR coalesce(f->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Enter a customer name and valid email'; END IF;
   SELECT o.id INTO office FROM public.company_offices o WHERE o.organization_id=actor.organization_id AND o.is_active
    ORDER BY (o.id=actor.primary_office_id) DESC NULLS LAST,(o.id=actor.default_office_id) DESC NULLS LAST,o.is_headquarters DESC NULLS LAST,o.display_order,o.id LIMIT 1;
   IF office IS NULL THEN RAISE EXCEPTION 'Configure an active company office before creating a customer'; END IF;
   INSERT INTO public.contacts(organization_id,contact_name,username,office_id,created_by,first_name,last_name,email,phone,street_address,city,state,zip_code,company_name)
    VALUES(actor.organization_id,btrim(f->>'first_name')||' '||btrim(f->>'last_name'),'contact-'||gen_random_uuid()::text,office,actor.id,f->>'first_name',f->>'last_name',f->>'email',f->>'phone',f->>'street_address',f->>'city',f->>'state',f->>'zip_code',f->>'company_name') RETURNING id INTO cid;
  END IF;
  SELECT * INTO ct FROM public.contacts WHERE id=cid AND organization_id=actor.organization_id;
  IF ct.id IS NULL THEN RAISE EXCEPTION 'Choose a customer from this organization'; END IF;
  IF p_payload->'contact_edits' IS NOT NULL AND p_payload->'contact_edits'<>'null'::jsonb THEN
   IF NOT (actor.role='admin' OR actor.can_edit_contacts) THEN RAISE EXCEPTION 'Contact editing permission is required'; END IF;
   f:=p_payload->'contact_edits';
   IF nullif(btrim(f->>'first_name'),'') IS NULL OR nullif(btrim(f->>'last_name'),'') IS NULL OR coalesce(f->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Enter a customer name and valid email'; END IF;
   UPDATE public.contacts SET contact_name=btrim(f->>'first_name')||' '||btrim(f->>'last_name'),first_name=f->>'first_name',last_name=f->>'last_name',email=f->>'email',phone=f->>'phone',street_address=f->>'street_address',city=f->>'city',state=f->>'state',zip_code=f->>'zip_code',company_name=f->>'company_name' WHERE id=cid;
  END IF;
  IF nullif(p_payload->>'sales_order_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sales_orders WHERE id=(p_payload->>'sales_order_id')::uuid AND organization_id=actor.organization_id AND contact_id=cid) THEN RAISE EXCEPTION 'Sales order must belong to this customer'; END IF;
  IF p_action='create' THEN
   INSERT INTO public.security_contracts(organization_id,creation_request_id,template_id,contact_id,sales_order_id,created_by_user_id,status,monthly_price,price_override,term_months,renewal_term_months,cancellation_notice_days)
    VALUES(actor.organization_id,req,(p_payload->>'template_id')::uuid,cid,nullif(p_payload->>'sales_order_id','')::uuid,actor.id,'draft',total,override,(p_payload->>'term_months')::integer,1,30) RETURNING * INTO c;
  ELSE
   total:=total+c.mail_invoice_fee;
   DELETE FROM public.security_contract_services WHERE contract_id=c.id;
  END IF;
  UPDATE public.security_contracts SET contact_id=cid,monthly_price=total,price_override=override,term_months=(p_payload->>'term_months')::integer,renewal_term_months=1,cancellation_notice_days=30,
   account_type=nullif(p_payload->>'account_type',''),account_services=ARRAY(SELECT jsonb_array_elements_text(coalesce(p_payload->'account_services','[]'))),
   is_monitoring=coalesce((p_payload->>'is_monitoring')::boolean,false),account_number=nullif(p_payload->>'account_number',''),installation_date=nullif(p_payload->>'installation_date','')::date,
   service_account_numbers=coalesce(p_payload->'service_account_numbers','{}'),notes=p_payload->>'notes',email_override=nullif(btrim(p_payload->>'email_override'),'') WHERE id=c.id;
  INSERT INTO public.security_contract_services(contract_id,organization_id,service_id,monthly_price)
   SELECT c.id,actor.organization_id,id,monthly_price FROM public.monitoring_services WHERE id=ANY(services);
  RETURN jsonb_build_object('id',c.id);
 END IF;
 IF p_action IN ('approve','activate','reject') THEN
  IF p_payload->>'revision' IS NULL OR (p_payload->>'revision')::integer IS DISTINCT FROM c.onboarding_revision THEN RAISE EXCEPTION 'Another person updated this agreement. Reload and review before continuing'; END IF;
  IF c.customer_completed_at IS NULL THEN RAISE EXCEPTION 'Complete customer onboarding before approval'; END IF;
  IF p_action IN ('approve','reject') AND c.status NOT IN ('pending_approval','customer_completed') THEN RAISE EXCEPTION 'Only submitted agreements can be reviewed'; END IF;
  IF p_action='activate' AND c.status<>'approved' THEN RAISE EXCEPTION 'Approve the agreement before activation'; END IF;
  IF p_action='reject' AND nullif(btrim(p_payload->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'Enter a reason for requesting corrections'; END IF;
  PERFORM set_config('mjv.security_signing','true',true);
  IF p_action='approve' THEN UPDATE public.security_contracts SET status='approved',approved_at=now(),approved_by_user_id=auth.uid() WHERE id=c.id;
  ELSIF p_action='activate' THEN
   IF nullif(p_payload->>'monitoring_start_date','') IS NULL OR nullif(p_payload->>'first_payment_date','') IS NULL THEN RAISE EXCEPTION 'Set the monitoring start and first payment dates before activation'; END IF;
   UPDATE public.security_contracts SET status='active',activated_at=now(),
    monitoring_start_date=(p_payload->>'monitoring_start_date')::date,
    first_payment_date=(p_payload->>'first_payment_date')::date WHERE id=c.id;
  ELSE UPDATE public.security_contracts SET status='rejected',rejection_reason=p_payload->>'reason' WHERE id=c.id; END IF;
  PERFORM set_config('mjv.security_signing','false',true);
  RETURN jsonb_build_object('success',true);
 END IF;
 IF p_action='paper' THEN
  IF coalesce(p_payload->>'account_type','') NOT IN ('residential','commercial') THEN RAISE EXCEPTION 'Choose residential or commercial'; END IF;
  IF c.customer_completed_at IS NOT NULL OR c.status NOT IN ('draft','pending_customer','rejected') THEN RAISE EXCEPTION 'This agreement is no longer available for paper completion'; END IF;
  f:=private.security_safe_draft(p_payload->'form_data'); PERFORM private.security_validate_form(f);
  IF coalesce(p_payload->>'paper_signed','false')<>'true' THEN RAISE EXCEPTION 'Confirm the customer signed the agreement'; END IF;
  d:=private.security_staff_document(c.id);
  IF p_payload->>'document_version' IS DISTINCT FROM md5(d::text) THEN RAISE EXCEPTION 'Agreement terms changed. Review the signed paper against the current agreement before recording it'; END IF;
  IF coalesce(d->'template'->>'contract_terms','')='' OR d->'template'->>'contract_terms' LIKE '%[LEGAL REVIEW:%' THEN RAISE EXCEPTION 'Reviewed agreement terms are required'; END IF;
  IF c.security_billing_mode='autopay' THEN
   SELECT * INTO m FROM public.security_payment_methods WHERE id=nullif(f->>'paymentMethodId','')::uuid AND organization_id=c.organization_id AND contact_id=c.contact_id AND is_active AND verified_at>now()-interval '5 minutes' AND (payment_type='ach' OR make_date(exp_year,exp_month,1)+interval '1 month'>now());
   IF m.id IS NULL OR coalesce(p_payload->>'autopay_accepted','false')<>'true' THEN RAISE EXCEPTION 'Verify the saved payment method and retain the customer-signed AutoPay authorization with the paper agreement'; END IF;
  END IF;
  IF f->>'billingPreference'='annual' AND coalesce(d->'dealer'->>'annual_billing_enabled','false')<>'true' THEN RAISE EXCEPTION 'Annual billing is unavailable'; END IF;
  d:=d||jsonb_build_object('personalInfo',f->'personalInfo','propertyInfo',f->'propertyInfo','billingPreference',f->>'billingPreference','accepted_at',now(),'document_version',md5(d::text),'payment_display',CASE WHEN m.id IS NULL THEN 'Admin-approved mailed invoices' ELSE m.display_brand||' ending '||m.display_last4 END,'paper_autopay_authorization_retained',m.id IS NOT NULL);
  DELETE FROM public.security_contract_emergency_contacts WHERE contract_id=c.id;
  FOR e,ord IN SELECT x.v,x.ordinality FROM jsonb_array_elements(f->'emergencyContacts') WITH ORDINALITY x(v,ordinality) LOOP
   INSERT INTO public.security_contract_emergency_contacts(contract_id,organization_id,contact_name,phone_number,password_codeword,can_authorize_entry,priority_order) VALUES(c.id,c.organization_id,e->>'name',e->>'phone',e->>'password',(e->>'canAuthorize')::boolean,ord);
  END LOOP;
  PERFORM set_config('mjv.security_signing','true',true);
  UPDATE public.security_contracts SET status='pending_approval',customer_completed_at=now(),completed_by_staff=true,
   property_address=f->'propertyInfo'->>'address_line1',property_city=f->'propertyInfo'->>'city',property_state=upper(f->'propertyInfo'->>'state'),property_zip=f->'propertyInfo'->>'zip_code',account_type=p_payload->>'account_type',account_services=ARRAY(SELECT jsonb_array_elements_text(coalesce(p_payload->'account_services','[]'))),
   payment_method=CASE WHEN m.payment_type='card' THEN 'credit_card' WHEN m.payment_type='ach' THEN 'ach' END,security_payment_method_id=m.id,autopay_authorized_at=CASE WHEN m.id IS NOT NULL THEN now() END,
   billing_frequency_override=CASE WHEN f->>'billingPreference'='annual' THEN 'yearly' ELSE 'monthly' END,onboarding_agreement_snapshot=d,updated_at=now() WHERE id=c.id;
  PERFORM set_config('mjv.security_signing','false',true);
  DELETE FROM public.security_onboarding_drafts WHERE contract_id=c.id;
  RETURN jsonb_build_object('success',true);
 END IF;
 RAISE EXCEPTION 'Unsupported staff operation';
END $$;
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
      INSERT INTO public.invoices(company_id,organization_id,contact_id,invoice_date,due_date,invoice_type,source_type,
        status,subtotal,total,amount_due,billing_name,billing_address_line1,billing_city,billing_state,billing_zip,
        jobsite_address,jobsite_city,jobsite_state,jobsite_zip,tax_environment,tax_project_type,notes)
      SELECT c.organization_id,c.organization_id,c.contact_id,v_start,private.security_period_date(coalesce(c.first_payment_date,c.security_billing_anchor+10),c.security_billing_period,v_months),'recurring','manual','draft',v_subtotal-v_discount,v_subtotal-v_discount,v_subtotal-v_discount,
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
   'first_payment_made_at',(SELECT min(p.created_at) FROM public.payments p JOIN public.security_billing_cycles b ON b.id=p.security_billing_cycle_id WHERE b.contract_id=c.id AND b.state='paid'),
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
