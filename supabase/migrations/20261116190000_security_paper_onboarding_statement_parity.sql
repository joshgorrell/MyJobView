
-- Signed agreement evidence is private; staff may only upload to their own organization's draft contract.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('security-signed-agreements','security-signed-agreements',false,15728640,ARRAY['application/pdf','image/jpeg','image/png'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=15728640,allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE POLICY "Security staff upload signed paper agreements" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='security-signed-agreements' AND EXISTS (
 SELECT 1 FROM public.security_contracts c JOIN public.profiles p ON p.organization_id=c.organization_id
 WHERE p.id=auth.uid() AND c.organization_id::text=split_part(name,'/',1)
 AND c.id::text=split_part(name,'/',2) AND c.status IN ('draft','pending_customer','rejected')
 AND c.customer_completed_at IS NULL AND private.security_staff_access(c.organization_id,false)
));
CREATE POLICY "Security staff read signed paper agreements" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='security-signed-agreements' AND EXISTS (
 SELECT 1 FROM public.security_contracts c JOIN public.profiles p ON p.organization_id=c.organization_id
 WHERE p.id=auth.uid() AND c.organization_id::text=split_part(name,'/',1)
 AND c.id::text=split_part(name,'/',2) AND private.security_staff_access(c.organization_id,true)
));

-- Align staff-entered paper agreements with electronic statement delivery choices.
-- Preserve the existing staff authorization, agreement validation, and approval gates.
CREATE OR REPLACE FUNCTION private.staff_security_onboarding(p_action text, p_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c public.security_contracts%ROWTYPE; actor public.profiles%ROWTYPE; cid uuid; req uuid; services uuid[];
 total numeric; override numeric; f jsonb; d jsonb; e jsonb; ord bigint; m public.security_payment_methods%ROWTYPE;
 ct public.contacts%ROWTYPE; office uuid; BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=auth.uid();
 IF NOT private.security_staff_access(actor.organization_id,p_action IN ('approve','activate','reject','review')) THEN
  RAISE EXCEPTION 'Security onboarding permission is required' USING ERRCODE='42501'; END IF;
 IF p_action='reject' THEN RAISE EXCEPTION 'Update the submitted fields through the review screen, then approve the agreement'; END IF;
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
    'services',(SELECT jsonb_agg(jsonb_build_object('service_id',svc.id,'name',svc.name,'monthly_price',svc.monthly_price) ORDER BY svc.name) FROM public.monitoring_services svc WHERE svc.id=ANY(services)),
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
  IF p_action='reject' THEN RAISE EXCEPTION 'Update the submitted fields through the review screen, then approve the agreement'; END IF;
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
  IF coalesce(p_payload->>'signed_agreement_path','') !~ ('^'||c.organization_id::text||'/'||c.id::text||'/[0-9a-f-]{36}\\.(pdf|png|jpg)$') THEN
   RAISE EXCEPTION 'Signed agreement upload is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='security-signed-agreements' AND o.name=p_payload->>'signed_agreement_path' AND o.owner_id=auth.uid()::text AND o.metadata->>'mimetype' IN ('application/pdf','image/jpeg','image/png') AND (o.metadata->>'size')::bigint BETWEEN 1 AND 15728640) THEN
   RAISE EXCEPTION 'Signed agreement must be uploaded by the submitting employee';
  END IF;
  d:=private.security_staff_document(c.id);
  IF p_payload->>'document_version' IS DISTINCT FROM md5(d::text) THEN RAISE EXCEPTION 'Agreement terms changed. Review the signed paper against the current agreement before recording it'; END IF;
  IF coalesce(d->'template'->>'contract_terms','')='' OR d->'template'->>'contract_terms' LIKE '%[LEGAL REVIEW:%' THEN RAISE EXCEPTION 'Reviewed agreement terms are required'; END IF;
  IF c.security_billing_mode='autopay' THEN
   SELECT * INTO m FROM public.security_payment_methods WHERE id=nullif(f->>'paymentMethodId','')::uuid AND organization_id=c.organization_id AND contact_id=c.contact_id AND is_active AND verified_at>now()-interval '5 minutes' AND (payment_type='ach' OR make_date(exp_year,exp_month,1)+interval '1 month'>now());
   IF m.id IS NULL OR coalesce(p_payload->>'autopay_accepted','false')<>'true' THEN RAISE EXCEPTION 'Verify the saved payment method and retain the customer-signed AutoPay authorization with the paper agreement'; END IF;
  END IF;
  IF c.security_billing_mode='mail' AND coalesce(p_payload->>'mailed_paper_statements','false')<>'true' THEN RAISE EXCEPTION 'Manual billing requires mailed paper statements'; END IF;
  IF jsonb_typeof(p_payload->'mailed_paper_statements') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Select a valid statement delivery preference'; END IF;
  IF f->>'billingPreference'='annual' AND coalesce(d->'dealer'->>'annual_billing_enabled','false')<>'true' THEN RAISE EXCEPTION 'Annual billing is unavailable'; END IF;
  d:=d||jsonb_build_object('personalInfo',f->'personalInfo','propertyInfo',f->'propertyInfo','billingPreference',f->>'billingPreference','accepted_at',now(),'document_version',md5(d::text),'payment_display',CASE WHEN m.id IS NULL THEN 'Admin-approved mailed invoices' ELSE m.display_brand||' ending '||m.display_last4 END,'paper_autopay_authorization_retained',m.id IS NOT NULL,'mailed_paper_statements',(p_payload->>'mailed_paper_statements')::boolean,'mail_invoice_fee',CASE WHEN (p_payload->>'mailed_paper_statements')::boolean THEN 5 ELSE 0 END,'monthly_price',c.monthly_price-c.mail_invoice_fee+CASE WHEN (p_payload->>'mailed_paper_statements')::boolean THEN 5 ELSE 0 END,'paper_entered_by',auth.uid(),'paper_entered_at',now(),'signed_agreement_path',p_payload->>'signed_agreement_path');
  DELETE FROM public.security_contract_emergency_contacts WHERE contract_id=c.id;
  FOR e,ord IN SELECT x.v,x.ordinality FROM jsonb_array_elements(f->'emergencyContacts') WITH ORDINALITY x(v,ordinality) LOOP
   INSERT INTO public.security_contract_emergency_contacts(contract_id,organization_id,contact_name,phone_number,password_codeword,can_authorize_entry,priority_order) VALUES(c.id,c.organization_id,e->>'name',e->>'phone',e->>'password',(e->>'canAuthorize')::boolean,ord);
  END LOOP;
  PERFORM set_config('mjv.security_signing','true',true);
  UPDATE public.security_contracts SET status='pending_approval',customer_completed_at=now(),completed_by_staff=true,
   property_address=f->'propertyInfo'->>'address_line1',property_city=f->'propertyInfo'->>'city',property_state=upper(f->'propertyInfo'->>'state'),property_zip=f->'propertyInfo'->>'zip_code',account_type=p_payload->>'account_type',account_services=ARRAY(SELECT jsonb_array_elements_text(coalesce(p_payload->'account_services','[]'))),
   payment_method=CASE WHEN m.payment_type='card' THEN 'credit_card' WHEN m.payment_type='ach' THEN 'ach' END,security_payment_method_id=m.id,autopay_authorized_at=CASE WHEN m.id IS NOT NULL THEN now() END,
   billing_frequency_override=CASE WHEN f->>'billingPreference'='annual' THEN 'yearly' ELSE 'monthly' END,mailed_paper_statements=(p_payload->>'mailed_paper_statements')::boolean,onboarding_agreement_snapshot=d,updated_at=now() WHERE id=c.id;
  PERFORM set_config('mjv.security_signing','false',true);
  DELETE FROM public.security_onboarding_drafts WHERE contract_id=c.id;
  RETURN jsonb_build_object('success',true);
 END IF;
 RAISE EXCEPTION 'Unsupported staff operation';
END $function$
;
