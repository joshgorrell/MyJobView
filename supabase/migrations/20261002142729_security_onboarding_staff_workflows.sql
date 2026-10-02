-- Staff workflows use the existing module grants. Portal users never gain staff
-- access merely by sharing an organization. All definer functions use empty paths.
CREATE FUNCTION private.security_staff_access(p_org uuid,p_manage boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=p_org
   AND p.is_active AND p.role<>'portal' AND NOT coalesce((auth.jwt()->'app_metadata'->>'is_portal_user')::boolean,false)
   AND (p.role='admin' OR EXISTS(SELECT 1 FROM public.department_modules m WHERE m.organization_id=p_org AND m.is_active
     AND m.module_key=ANY(CASE WHEN p_manage THEN ARRAY['contract_management'] ELSE ARRAY['security_onboarding','contract_management'] END)
     AND public.get_user_module_access(p.id,m.id))));
$$;
REVOKE ALL ON FUNCTION private.security_staff_access(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.security_staff_access(uuid,boolean) TO authenticated;
CREATE FUNCTION public.security_staff_access(p_org uuid,p_manage boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.security_staff_access(p_org,p_manage); $$;
REVOKE ALL ON FUNCTION public.security_staff_access(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.security_staff_access(uuid,boolean) TO authenticated;

-- Restrictive policies also constrain older permissive organization policies.
CREATE POLICY security_staff_scope ON public.security_contracts AS RESTRICTIVE FOR ALL TO authenticated USING(private.security_staff_access(organization_id)) WITH CHECK(private.security_staff_access(organization_id));
DO $$ DECLARE t text; predicate text; BEGIN
 FOREACH t IN ARRAY ARRAY['security_contract_services','security_contract_emergency_contacts'] LOOP
  predicate:=format('private.security_staff_access(organization_id) AND EXISTS(SELECT 1 FROM public.security_contracts c WHERE c.id=%1$I.contract_id AND c.organization_id=%1$I.organization_id)',t);
  EXECUTE format('CREATE POLICY security_staff_scope ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',t,predicate,predicate);
 END LOOP;
END $$;

CREATE FUNCTION private.security_validate_form(f jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$ DECLARE e jsonb; BEGIN
 IF coalesce(f->'personalInfo'->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
   OR length(regexp_replace(coalesce(f->'personalInfo'->>'phone',''),'[^0-9]','','g')) NOT BETWEEN 10 AND 15
   OR coalesce(f->'propertyInfo'->>'state','') !~ '^[A-Za-z]{2}$'
   OR coalesce(f->'propertyInfo'->>'zip_code','') !~ '^[0-9]{5}(-[0-9]{4})?$'
   OR nullif(btrim(f->'personalInfo'->>'full_name'),'') IS NULL
   OR nullif(btrim(f->'propertyInfo'->>'address_line1'),'') IS NULL
   OR nullif(btrim(f->'propertyInfo'->>'city'),'') IS NULL
   OR jsonb_array_length(coalesce(f->'emergencyContacts','[]')) NOT BETWEEN 2 AND 10 THEN
  RAISE EXCEPTION 'Enter a valid name, email, phone, service address, two-letter state, ZIP, and 2–10 emergency contacts';
 END IF;
 FOR e IN SELECT * FROM jsonb_array_elements(f->'emergencyContacts') LOOP
  IF nullif(btrim(e->>'name'),'') IS NULL OR nullif(btrim(e->>'password'),'') IS NULL
    OR length(regexp_replace(coalesce(e->>'phone',''),'[^0-9]','','g')) NOT BETWEEN 10 AND 15 THEN
   RAISE EXCEPTION 'Each emergency contact needs a name, valid phone, and codeword';
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION private.security_validate_form(jsonb) FROM PUBLIC,anon,authenticated;

ALTER TABLE public.security_contracts ADD COLUMN creation_request_id uuid;
CREATE UNIQUE INDEX security_contract_creation_request ON public.security_contracts(organization_id,creation_request_id) WHERE creation_request_id IS NOT NULL;
-- Draft and executed documents use one server representation. Private helper is
-- callable only inside authorized workflows; no caller-provided tenant/customer IDs.
CREATE FUNCTION private.security_staff_document(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.security_contracts%ROWTYPE; d jsonb; BEGIN
 SELECT * INTO c FROM public.security_contracts WHERE id=p_id;
 SELECT jsonb_build_object('contract_number',c.contract_number,'monthly_price',c.monthly_price,
 'term_months',c.term_months,'renewal_term_months',c.renewal_term_months,'cancellation_notice_days',c.cancellation_notice_days,
 'template',(SELECT jsonb_build_object('name',t.name,'contract_terms',t.contract_terms) FROM public.security_contract_templates t WHERE t.id=c.template_id AND t.organization_id=c.organization_id),
 'dealer',(SELECT jsonb_build_object('company_name',s.company_name,'company_email',s.company_email,'annual_billing_enabled',s.annual_billing_enabled,'annual_discount_type',s.annual_discount_type,'annual_discount_percentage',s.annual_discount_percentage,'annual_discount_flat_amount',s.annual_discount_flat_amount) FROM public.company_settings s WHERE s.organization_id=c.organization_id LIMIT 1),
 'services',coalesce((SELECT jsonb_agg(jsonb_build_object('name',m.name,'monthly_price',cs.monthly_price) ORDER BY m.name,cs.id) FROM public.security_contract_services cs JOIN public.monitoring_services m ON m.id=cs.service_id WHERE cs.contract_id=c.id),'[]'),
 'billing_mode',c.security_billing_mode,'mail_invoice_fee',c.mail_invoice_fee,
 'billingPreference',CASE WHEN c.billing_frequency_override='yearly' THEN 'annual' ELSE 'monthly' END) INTO d;
 RETURN coalesce(c.onboarding_agreement_snapshot,d);
END $$;
REVOKE ALL ON FUNCTION private.security_staff_document(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.staff_security_onboarding(p_action text,p_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.security_contracts%ROWTYPE; actor public.profiles%ROWTYPE; cid uuid; req uuid; services uuid[];
 total numeric; override numeric; f jsonb; d jsonb; e jsonb; ord bigint; m public.security_payment_methods%ROWTYPE;
 ct public.contacts%ROWTYPE; BEGIN
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
 ELSE
  SELECT * INTO c FROM public.security_contracts WHERE id=p_id AND organization_id=actor.organization_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Agreement not found' USING ERRCODE='42501'; END IF;
 END IF;
 IF p_action IN ('get','review') THEN RETURN jsonb_build_object('id',c.id,'status',c.status,'customer_completed_at',c.customer_completed_at,'document',private.security_staff_document(c.id),'document_version',md5(private.security_staff_document(c.id)::text)); END IF;
 IF p_action='create' OR p_action='edit' THEN
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
  IF nullif(p_payload->>'email_override','') IS NOT NULL AND p_payload->>'email_override' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Enter a valid invitation email'; END IF;
  cid:=nullif(p_payload->>'contact_id','')::uuid;
  IF cid IS NULL THEN
   IF p_action<>'create' OR p_payload->'new_contact' IS NULL THEN RAISE EXCEPTION 'Choose a customer'; END IF;
   f:=p_payload->'new_contact';
   IF nullif(btrim(f->>'first_name'),'') IS NULL OR nullif(btrim(f->>'last_name'),'') IS NULL OR coalesce(f->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Enter a customer name and valid email'; END IF;
   INSERT INTO public.contacts(organization_id,first_name,last_name,email,phone,street_address,city,state,zip_code,company_name)
    VALUES(actor.organization_id,f->>'first_name',f->>'last_name',f->>'email',f->>'phone',f->>'street_address',f->>'city',f->>'state',f->>'zip_code',f->>'company_name') RETURNING id INTO cid;
  END IF;
  SELECT * INTO ct FROM public.contacts WHERE id=cid AND organization_id=actor.organization_id;
  IF ct.id IS NULL THEN RAISE EXCEPTION 'Choose a customer from this organization'; END IF;
  IF p_payload->'contact_edits' IS NOT NULL AND p_payload->'contact_edits'<>'null'::jsonb THEN
   IF NOT (actor.role='admin' OR actor.can_edit_contacts) THEN RAISE EXCEPTION 'Contact editing permission is required'; END IF;
   f:=p_payload->'contact_edits';
   IF nullif(btrim(f->>'first_name'),'') IS NULL OR nullif(btrim(f->>'last_name'),'') IS NULL OR coalesce(f->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Enter a customer name and valid email'; END IF;
   UPDATE public.contacts SET first_name=f->>'first_name',last_name=f->>'last_name',email=f->>'email',phone=f->>'phone',street_address=f->>'street_address',city=f->>'city',state=f->>'state',zip_code=f->>'zip_code',company_name=f->>'company_name' WHERE id=cid;
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
  ELSIF p_action='activate' THEN UPDATE public.security_contracts SET status='active',activated_at=now() WHERE id=c.id;
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
REVOKE ALL ON FUNCTION private.staff_security_onboarding(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.staff_security_onboarding(text,uuid,jsonb) TO authenticated;
CREATE FUNCTION public.staff_security_onboarding(p_action text,p_id uuid DEFAULT NULL,p_payload jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.staff_security_onboarding(p_action,p_id,p_payload); $$;
REVOKE ALL ON FUNCTION public.staff_security_onboarding(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staff_security_onboarding(text,uuid,jsonb) TO authenticated;

-- Preparation does not rotate the currently delivered token. The mail provider's
-- idempotency key is stable for an unfinished attempt, including network timeouts.
CREATE TABLE public.security_invitation_attempts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),contract_id uuid NOT NULL REFERENCES public.security_contracts(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL,actor_id uuid NOT NULL,request_id uuid NOT NULL,token uuid NOT NULL DEFAULT gen_random_uuid(),recipient text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',created_at timestamptz NOT NULL DEFAULT now(),sent_at timestamptz,provider_id text,message jsonb,UNIQUE(organization_id,request_id));
CREATE UNIQUE INDEX security_invitation_pending ON public.security_invitation_attempts(contract_id) WHERE sent_at IS NULL;
ALTER TABLE public.security_invitation_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_invitation_attempts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.security_invitation_attempts TO service_role;
CREATE FUNCTION private.security_prepare_invitation(p_id uuid,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.security_contracts%ROWTYPE; a public.security_invitation_attempts%ROWTYPE; email text; BEGIN
 SELECT * INTO c FROM public.security_contracts WHERE id=p_id FOR UPDATE;
 IF c.id IS NULL OR NOT private.security_staff_access(c.organization_id) THEN RAISE EXCEPTION 'Security onboarding permission required' USING ERRCODE='42501'; END IF;
 IF p_request IS NULL THEN RAISE EXCEPTION 'Invitation request ID required'; END IF;
 SELECT * INTO a FROM public.security_invitation_attempts WHERE organization_id=c.organization_id AND request_id=p_request;
 IF a.id IS NOT NULL THEN
  IF a.contract_id<>c.id THEN RAISE EXCEPTION 'Invitation request belongs to another agreement'; END IF;
  IF a.sent_at IS NOT NULL THEN RETURN to_jsonb(a); END IF;
 END IF;
 IF c.customer_completed_at IS NOT NULL OR c.status NOT IN ('draft','pending_customer','rejected') THEN RAISE EXCEPTION 'Only unsigned agreements can be invited'; END IF;
 SELECT coalesce(nullif(c.email_override,''),ct.email) INTO email FROM public.contacts ct WHERE ct.id=c.contact_id AND ct.organization_id=c.organization_id;
 IF coalesce(email,'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Enter a valid invitation email'; END IF;
 SELECT * INTO a FROM public.security_invitation_attempts WHERE contract_id=c.id AND sent_at IS NULL;
 IF a.id IS NOT NULL AND (a.recipient<>email OR a.created_at<now()-interval '23 hours') THEN RAISE EXCEPTION 'An earlier delivery outcome needs reconciliation before a new invitation can be sent'; END IF;
 IF a.id IS NULL THEN INSERT INTO public.security_invitation_attempts(contract_id,organization_id,actor_id,recipient,request_id) VALUES(c.id,c.organization_id,auth.uid(),email,p_request) RETURNING * INTO a; END IF;
 RETURN to_jsonb(a);
END $$;
REVOKE ALL ON FUNCTION private.security_prepare_invitation(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.security_prepare_invitation(uuid,uuid) TO authenticated;
CREATE FUNCTION public.security_prepare_invitation(p_id uuid,p_request uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.security_prepare_invitation(p_id,p_request); $$;
REVOKE ALL ON FUNCTION public.security_prepare_invitation(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.security_prepare_invitation(uuid,uuid) TO authenticated;
-- Freeze the provider payload as well as its key; provider retries require both
-- to match. Aged uncertain outcomes must be reconciled instead of sent again.
CREATE FUNCTION public.security_invitation_message(p_attempt uuid,p_message jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.security_invitation_attempts%ROWTYPE; BEGIN
 SELECT * INTO a FROM public.security_invitation_attempts WHERE id=p_attempt FOR UPDATE;
 IF a.id IS NULL OR a.created_at<now()-interval '23 hours' THEN RAISE EXCEPTION 'Delivery outcome needs reconciliation'; END IF;
 IF a.message IS NULL THEN
  IF p_message->'to' IS DISTINCT FROM jsonb_build_array(a.recipient) THEN RAISE EXCEPTION 'Invitation recipient mismatch'; END IF;
  UPDATE public.security_invitation_attempts SET message=p_message WHERE id=a.id RETURNING * INTO a;
 END IF;
 RETURN a.message;
END $$;
REVOKE ALL ON FUNCTION public.security_invitation_message(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.security_invitation_message(uuid,jsonb) TO service_role;
CREATE FUNCTION public.security_finish_invitation(p_attempt uuid,p_provider_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.security_invitation_attempts%ROWTYPE; c public.security_contracts%ROWTYPE; BEGIN
 SELECT * INTO a FROM public.security_invitation_attempts WHERE id=p_attempt;
 IF a.id IS NULL OR nullif(p_provider_id,'') IS NULL THEN RAISE EXCEPTION 'Provider acceptance is required'; END IF;
 IF a.sent_at IS NOT NULL THEN RETURN; END IF;
 SELECT * INTO c FROM public.security_contracts WHERE id=a.contract_id FOR UPDATE;
 SELECT * INTO a FROM public.security_invitation_attempts WHERE id=p_attempt FOR UPDATE;
 IF a.sent_at IS NOT NULL THEN RETURN; END IF;
 IF c.customer_completed_at IS NOT NULL THEN RAISE EXCEPTION 'Agreement was submitted while invitation was being sent'; END IF;
 UPDATE public.security_contracts SET magic_link_token=a.token,magic_link_expires_at=a.expires_at,invitation_sent_at=now(),invitation_sent_by_user_id=a.actor_id,status='pending_customer' WHERE id=c.id;
 UPDATE public.security_invitation_attempts SET sent_at=now(),provider_id=p_provider_id WHERE id=a.id;
END $$;
REVOKE ALL ON FUNCTION public.security_finish_invitation(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.security_finish_invitation(uuid,text) TO service_role;

-- Protect accepted business terms and restrict direct approval/activation to
-- Contract Management grants; authorized portal/paper signing uses its own guard.
CREATE FUNCTION private.security_contract_workflow_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF TG_OP='UPDATE' AND current_setting('mjv.security_signing',true) IS DISTINCT FROM 'true' THEN
  IF NEW.onboarding_original_snapshot IS DISTINCT FROM OLD.onboarding_original_snapshot OR NEW.onboarding_revision IS DISTINCT FROM OLD.onboarding_revision THEN RAISE EXCEPTION 'Use the correction workflow to record revisions'; END IF;
  IF OLD.onboarding_agreement_snapshot IS NOT NULL AND
    (NEW.contact_id IS DISTINCT FROM OLD.contact_id OR NEW.template_id IS DISTINCT FROM OLD.template_id OR NEW.term_months IS DISTINCT FROM OLD.term_months
     OR NEW.renewal_term_months IS DISTINCT FROM OLD.renewal_term_months OR NEW.monthly_price IS DISTINCT FROM OLD.monthly_price
     OR NEW.billing_frequency_override IS DISTINCT FROM OLD.billing_frequency_override
     OR ROW(NEW.property_address,NEW.property_city,NEW.property_state,NEW.property_zip,NEW.account_type,NEW.account_services,NEW.is_monitoring,NEW.account_number,NEW.installation_date,NEW.service_account_numbers,NEW.notes,NEW.email_override,NEW.monitoring_tax_classification_id) IS DISTINCT FROM ROW(OLD.property_address,OLD.property_city,OLD.property_state,OLD.property_zip,OLD.account_type,OLD.account_services,OLD.is_monitoring,OLD.account_number,OLD.installation_date,OLD.service_account_numbers,OLD.notes,OLD.email_override,OLD.monitoring_tax_classification_id)) THEN
   RAISE EXCEPTION 'Accepted agreement terms are immutable; use an amendment'; END IF;
  IF OLD.onboarding_agreement_snapshot IS NOT NULL AND auth.uid() IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','active','rejected') THEN RAISE EXCEPTION 'Use the reviewed approval workflow'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','active','rejected','cancelled') AND auth.uid() IS NOT NULL
    AND NOT private.security_staff_access(NEW.organization_id,true) THEN RAISE EXCEPTION 'Contract Management permission is required' USING ERRCODE='42501'; END IF;
  IF NEW.status='active' AND NEW.status IS DISTINCT FROM OLD.status AND OLD.status<>'approved' THEN RAISE EXCEPTION 'Approve the agreement before activation'; END IF;
  IF NEW.status='approved' AND NEW.status IS DISTINCT FROM OLD.status AND OLD.status NOT IN ('pending_approval','customer_completed') THEN RAISE EXCEPTION 'Only submitted agreements can be approved'; END IF;
  IF NEW.status IN ('approved','active') AND NEW.status IS DISTINCT FROM OLD.status AND NEW.customer_completed_at IS NULL THEN RAISE EXCEPTION 'Complete customer onboarding before approval or activation'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.security_contract_workflow_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER security_contract_workflow_guard BEFORE UPDATE ON public.security_contracts FOR EACH ROW EXECUTE FUNCTION private.security_contract_workflow_guard();

-- Decorate the existing portal workflow, retaining token expiry, row locks,
-- document/revision validation and payment checks from the tested core.
ALTER FUNCTION private.portal_security_onboarding(text,uuid,text,jsonb) RENAME TO security_onboarding_summary_core;
REVOKE ALL ON FUNCTION private.security_onboarding_summary_core(text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.portal_security_onboarding(p_action text,p_contract_id uuid,p_token text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb; f jsonb; cid uuid; BEGIN
 IF p_action='submit' THEN
  -- Authorize before validation; do not expose contract state to an unauthenticated caller.
  r:=private.security_onboarding_summary_core('get',p_contract_id,p_token,'{}');
  cid:=(r->>'id')::uuid;
  f:=private.security_safe_draft(p_payload->'form_data');PERFORM private.security_validate_form(f);
 END IF;
 r:=private.security_onboarding_summary_core(p_action,p_contract_id,p_token,p_payload);
 IF p_action='submit' THEN
  PERFORM set_config('mjv.security_signing','true',true);
  UPDATE public.security_contracts SET property_address=f->'propertyInfo'->>'address_line1',property_city=f->'propertyInfo'->>'city',property_state=upper(f->'propertyInfo'->>'state'),property_zip=f->'propertyInfo'->>'zip_code' WHERE id=cid;
  PERFORM set_config('mjv.security_signing','false',true);
 END IF;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION private.portal_security_onboarding(text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.portal_security_onboarding(text,uuid,text,jsonb) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.portal_security_onboarding(p_action text,p_contract_id uuid DEFAULT NULL,p_token text DEFAULT NULL,p_payload jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.portal_security_onboarding(p_action,p_contract_id,p_token,p_payload); $$;

-- Parameterize only the inactive review draft; never rewrite an executed snapshot.
UPDATE public.security_contract_templates SET contract_terms=replace(replace(contract_terms,'initial monitoring term is 36 months','initial monitoring term is [term]'),'initial 36-month term','initial term'),description=replace(description,'36 months then','Selected initial term then')
 WHERE NOT is_active AND name LIKE '%DRAFT LEGAL REVIEW%';

-- The existing Admin-only mailed billing exception may be corrected through the
-- same audited workflow after submission; direct changes remain blocked.
DO $patch$ DECLARE body text; BEGIN
 body:=pg_get_functiondef('private.enforce_security_billing()'::regprocedure);
 body:=replace(body,'IF NEW.customer_completed_at IS NOT NULL THEN RAISE EXCEPTION',
   'IF NEW.customer_completed_at IS NOT NULL AND current_setting(''mjv.security_signing'',true) IS DISTINCT FROM ''true'' THEN RAISE EXCEPTION');
 EXECUTE body;
END $patch$;

-- Deliberate staff corrections preserve the original submission and every revision.
ALTER TABLE public.security_contracts ADD COLUMN onboarding_original_snapshot jsonb;
ALTER TABLE public.security_contracts ADD COLUMN onboarding_revision integer NOT NULL DEFAULT 0;
CREATE TABLE public.security_onboarding_corrections(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),contract_id uuid NOT NULL REFERENCES public.security_contracts(id),
 organization_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES public.profiles(id),created_at timestamptz NOT NULL DEFAULT now(),
 revision integer NOT NULL,reason text NOT NULL,before_data jsonb NOT NULL,after_data jsonb NOT NULL,
 UNIQUE(contract_id,revision));
ALTER TABLE public.security_onboarding_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_onboarding_corrections FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.security_onboarding_corrections TO authenticated;
CREATE POLICY security_correction_history ON public.security_onboarding_corrections FOR SELECT TO authenticated USING(private.security_staff_access(organization_id,true));
CREATE FUNCTION private.security_correct_onboarding(p_id uuid,p_revision integer,p_patch jsonb,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.security_contracts%ROWTYPE; n public.security_contracts%ROWTYPE; d jsonb; f jsonb; old_data jsonb; e jsonb; ord bigint;
 k text; services uuid[]; m public.security_payment_methods%ROWTYPE; BEGIN
 SELECT * INTO c FROM public.security_contracts WHERE id=p_id FOR UPDATE;
 IF c.id IS NULL OR NOT private.security_staff_access(c.organization_id,true) THEN RAISE EXCEPTION 'Contract Management permission required' USING ERRCODE='42501'; END IF;
 IF c.customer_completed_at IS NULL OR c.status NOT IN ('customer_completed','pending_approval','approved','rejected') THEN RAISE EXCEPTION 'Corrections are available on submitted agreements before activation'; END IF;
 IF p_revision IS DISTINCT FROM c.onboarding_revision THEN RAISE EXCEPTION 'Another person updated this agreement. Reload before editing'; END IF;
 IF length(btrim(coalesce(p_reason,'')))<3 THEN RAISE EXCEPTION 'Enter the reason for this correction'; END IF;
 IF p_patch IS NULL OR p_patch='{}'::jsonb OR jsonb_typeof(p_patch)<>'object' THEN RAISE EXCEPTION 'Choose a field to correct'; END IF;
 FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
  IF k<>ALL(ARRAY['personalInfo','propertyInfo','emergencyContacts','contract_number','monthly_price','term_months','renewal_term_months','cancellation_notice_days','billingPreference','account_type','account_services','is_monitoring','account_number','installation_date','service_account_numbers','notes','email_override','service_ids','contract_terms','paymentMethodId','autopay_accepted','security_billing_mode','customer_signature','customer_signature_date','monitoring_tax_classification_id']) THEN RAISE EXCEPTION 'Field cannot be changed through this workflow: %',k; END IF;
 END LOOP;
 d:=private.security_staff_document(c.id);
 old_data:=jsonb_build_object('document',d,'contract',to_jsonb(c)-'magic_link_token'-'payment_token'-'onboarding_original_snapshot','emergencyContacts',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',contact_name,'phone',phone_number,'password',password_codeword,'canAuthorize',can_authorize_entry) ORDER BY priority_order),'[]') FROM public.security_contract_emergency_contacts WHERE contract_id=c.id));
 f:=jsonb_build_object('personalInfo',coalesce(d->'personalInfo',(SELECT jsonb_build_object('full_name',ct.full_name,'email',ct.email,'phone',ct.phone) FROM public.contacts ct WHERE ct.id=c.contact_id)),
 'propertyInfo',coalesce(d->'propertyInfo',jsonb_build_object('address_line1',c.property_address,'city',c.property_city,'state',c.property_state,'zip_code',c.property_zip)),
 'emergencyContacts',old_data->'emergencyContacts','billingPreference',coalesce(d->>'billingPreference','monthly'));
 IF p_patch ? 'personalInfo' THEN f:=jsonb_set(f,'{personalInfo}',(f->'personalInfo')||(p_patch->'personalInfo')); END IF;
 IF p_patch ? 'propertyInfo' THEN f:=jsonb_set(f,'{propertyInfo}',(f->'propertyInfo')||(p_patch->'propertyInfo')); END IF;
 IF p_patch ? 'emergencyContacts' THEN f:=jsonb_set(f,'{emergencyContacts}',p_patch->'emergencyContacts'); END IF;
 IF p_patch ? 'billingPreference' THEN f:=jsonb_set(f,'{billingPreference}',p_patch->'billingPreference'); END IF;
 PERFORM private.security_validate_form(f);
 IF f->>'billingPreference' NOT IN ('monthly','annual') OR (f->>'billingPreference'='annual' AND coalesce(d->'dealer'->>'annual_billing_enabled','false')<>'true') THEN RAISE EXCEPTION 'Choose an available billing preference'; END IF;
 SELECT * INTO n FROM jsonb_populate_record(c,p_patch-'personalInfo'-'propertyInfo'-'emergencyContacts'-'service_ids'-'contract_terms'-'paymentMethodId'-'autopay_accepted'-'billingPreference');
 IF n.term_months IS NULL OR n.term_months NOT IN (12,24,36,48,60) OR n.monthly_price IS NULL OR n.monthly_price<0 OR n.monthly_price>1000000 OR n.renewal_term_months<1 OR n.cancellation_notice_days<1 THEN RAISE EXCEPTION 'Enter valid price, term, renewal, and notice values'; END IF;
 IF n.account_type IS NOT NULL AND n.account_type NOT IN ('residential','commercial') THEN RAISE EXCEPTION 'Choose residential or commercial'; END IF;
 IF nullif(n.email_override,'') IS NOT NULL AND n.email_override !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Enter a valid invitation email'; END IF;
 IF p_patch ? 'monitoring_tax_classification_id' AND n.monitoring_tax_classification_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tax_classifications WHERE id=n.monitoring_tax_classification_id AND organization_id=c.organization_id AND is_active) THEN RAISE EXCEPTION 'Choose an active tax classification from this organization'; END IF;
 IF p_patch ? 'customer_signature' AND (coalesce(n.customer_signature,'') !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' OR length(n.customer_signature)>700000) THEN RAISE EXCEPTION 'Capture a valid customer signature'; END IF;
 IF p_patch ? 'customer_signature_date' AND (n.customer_signature_date IS NULL OR n.customer_signature_date>now()) THEN RAISE EXCEPTION 'Enter a valid signing date'; END IF;
 IF n.security_billing_mode NOT IN ('autopay','mail') THEN RAISE EXCEPTION 'Choose AutoPay or mailed invoices'; END IF;
 IF n.security_billing_mode IS DISTINCT FROM c.security_billing_mode AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin' AND organization_id=c.organization_id) THEN RAISE EXCEPTION 'Only an Admin may change the mailed billing exception'; END IF;
 IF c.security_billing_mode='mail' AND n.security_billing_mode='autopay' AND NOT p_patch ? 'paymentMethodId' THEN RAISE EXCEPTION 'Verify a payment method and confirm customer AutoPay authorization'; END IF;
 IF p_patch ? 'paymentMethodId' THEN
  SELECT * INTO m FROM public.security_payment_methods WHERE id=(p_patch->>'paymentMethodId')::uuid AND organization_id=c.organization_id AND contact_id=c.contact_id AND is_active AND verified_at>now()-interval '5 minutes' AND (payment_type='ach' OR make_date(exp_year,exp_month,1)+interval '1 month'>now());
  IF n.security_billing_mode<>'autopay' OR m.id IS NULL OR coalesce(p_patch->>'autopay_accepted','false')<>'true' THEN RAISE EXCEPTION 'Verify the saved payment method and confirm customer AutoPay authorization'; END IF;
  n.security_payment_method_id:=m.id;n.autopay_authorized_at:=now();n.autopay_paused:=false;n.autopay_revoked_at:=NULL;n.payment_method:=CASE WHEN m.payment_type='card' THEN 'credit_card' ELSE 'ach' END;
  d:=d||jsonb_build_object('payment_display',m.display_brand||' ending '||m.display_last4);
 END IF;
 PERFORM set_config('mjv.security_signing','true',true);
 IF p_patch ? 'service_ids' THEN
  SELECT array_agg(DISTINCT v::uuid) INTO services FROM jsonb_array_elements_text(p_patch->'service_ids') x(v);
  IF coalesce(cardinality(services),0)=0 OR (SELECT count(*) FROM public.monitoring_services WHERE id=ANY(services) AND organization_id=c.organization_id AND is_active)<>cardinality(services) THEN RAISE EXCEPTION 'Choose active monitoring services from this organization'; END IF;
  DELETE FROM public.security_contract_services WHERE contract_id=c.id;
  INSERT INTO public.security_contract_services(contract_id,organization_id,service_id,monthly_price) SELECT c.id,c.organization_id,id,monthly_price FROM public.monitoring_services WHERE id=ANY(services);
  SELECT jsonb_agg(jsonb_build_object('name',name,'monthly_price',monthly_price) ORDER BY name) INTO e FROM public.monitoring_services WHERE id=ANY(services);
  d:=d||jsonb_build_object('services',e);
  IF NOT p_patch ? 'monthly_price' THEN SELECT sum(monthly_price)+c.mail_invoice_fee INTO n.monthly_price FROM public.monitoring_services WHERE id=ANY(services); END IF;
 END IF;
 IF p_patch ? 'contract_terms' THEN
  IF nullif(btrim(p_patch->>'contract_terms'),'') IS NULL OR p_patch->>'contract_terms' LIKE '%[LEGAL REVIEW:%' THEN RAISE EXCEPTION 'Reviewed agreement terms are required'; END IF;
  d:=jsonb_set(d,'{template,contract_terms}',p_patch->'contract_terms');
 END IF;
 IF p_patch ? 'emergencyContacts' THEN
  DELETE FROM public.security_contract_emergency_contacts WHERE contract_id=c.id;
  FOR e,ord IN SELECT x.v,x.ordinality FROM jsonb_array_elements(f->'emergencyContacts') WITH ORDINALITY x(v,ordinality) LOOP
   INSERT INTO public.security_contract_emergency_contacts(contract_id,organization_id,contact_name,phone_number,password_codeword,can_authorize_entry,priority_order) VALUES(c.id,c.organization_id,e->>'name',e->>'phone',e->>'password',coalesce((e->>'canAuthorize')::boolean,false),ord);
  END LOOP;
 END IF;
 d:=d||jsonb_build_object('personalInfo',f->'personalInfo','propertyInfo',f->'propertyInfo','billingPreference',f->>'billingPreference','contract_number',n.contract_number,'monthly_price',n.monthly_price,'term_months',n.term_months,'renewal_term_months',n.renewal_term_months,'cancellation_notice_days',n.cancellation_notice_days,'staff_corrected_at',now(),'staff_corrected_by',auth.uid());
 PERFORM set_config('mjv.security_signing','true',true);
 UPDATE public.security_contracts SET onboarding_original_snapshot=coalesce(onboarding_original_snapshot,jsonb_build_object('document',c.onboarding_agreement_snapshot,'signature',c.customer_signature,'signed_at',c.customer_signature_date)),onboarding_agreement_snapshot=d,onboarding_revision=onboarding_revision+1,
  contract_number=n.contract_number,monthly_price=n.monthly_price,term_months=n.term_months,renewal_term_months=n.renewal_term_months,cancellation_notice_days=n.cancellation_notice_days,
  property_address=f->'propertyInfo'->>'address_line1',property_city=f->'propertyInfo'->>'city',property_state=upper(f->'propertyInfo'->>'state'),property_zip=f->'propertyInfo'->>'zip_code',
  billing_frequency_override=CASE WHEN f->>'billingPreference'='annual' THEN 'yearly' ELSE 'monthly' END,account_type=n.account_type,account_services=n.account_services,is_monitoring=n.is_monitoring,account_number=n.account_number,installation_date=n.installation_date,service_account_numbers=n.service_account_numbers,notes=n.notes,email_override=n.email_override,
  security_payment_method_id=n.security_payment_method_id,autopay_authorized_at=n.autopay_authorized_at,autopay_paused=n.autopay_paused,autopay_revoked_at=n.autopay_revoked_at,payment_method=n.payment_method,customer_signature=n.customer_signature,customer_signature_date=n.customer_signature_date,monitoring_tax_classification_id=n.monitoring_tax_classification_id,
  security_billing_mode=n.security_billing_mode,status='pending_approval',updated_at=now() WHERE id=c.id RETURNING * INTO n;
 d:=d||jsonb_build_object('monthly_price',n.monthly_price,'billing_mode',n.security_billing_mode,'mail_invoice_fee',n.mail_invoice_fee);
 UPDATE public.security_contracts SET onboarding_agreement_snapshot=d WHERE id=c.id;
 INSERT INTO public.security_onboarding_corrections(contract_id,organization_id,actor_id,revision,reason,before_data,after_data) VALUES(c.id,c.organization_id,auth.uid(),c.onboarding_revision+1,btrim(p_reason),old_data,jsonb_build_object('patch',p_patch,'document',d));
 PERFORM set_config('mjv.security_signing','false',true);
 RETURN jsonb_build_object('revision',c.onboarding_revision+1);
END $$;
REVOKE ALL ON FUNCTION private.security_correct_onboarding(uuid,integer,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.security_correct_onboarding(uuid,integer,jsonb,text) TO authenticated;
CREATE FUNCTION public.security_correct_onboarding(p_id uuid,p_revision integer,p_patch jsonb,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.security_correct_onboarding(p_id,p_revision,p_patch,p_reason); $$;
REVOKE ALL ON FUNCTION public.security_correct_onboarding(uuid,integer,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.security_correct_onboarding(uuid,integer,jsonb,text) TO authenticated;

-- Related rows cannot silently rewrite a completed agreement outside corrections.
CREATE FUNCTION private.security_related_record_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cid uuid; BEGIN
 IF TG_OP='DELETE' THEN cid:=OLD.contract_id; ELSE cid:=NEW.contract_id; END IF;
 IF current_setting('mjv.security_signing',true) IS DISTINCT FROM 'true' AND EXISTS(SELECT 1 FROM public.security_contracts WHERE id=cid AND customer_completed_at IS NOT NULL) THEN RAISE EXCEPTION 'Use the contract field edit controls to record corrections'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION private.security_related_record_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER security_related_record_guard BEFORE INSERT OR UPDATE OR DELETE ON public.security_contract_services FOR EACH ROW EXECUTE FUNCTION private.security_related_record_guard();
CREATE TRIGGER security_related_record_guard BEFORE INSERT OR UPDATE OR DELETE ON public.security_contract_emergency_contacts FOR EACH ROW EXECUTE FUNCTION private.security_related_record_guard();
