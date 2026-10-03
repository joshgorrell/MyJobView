-- Manual hosted-schema audit. Requires zero live security contracts. All changes roll back; no merchant API calls.
BEGIN;
DO $test$
DECLARE actor public.profiles%ROWTYPE; ct public.contacts%ROWTYPE; org uuid; tpl uuid; svc uuid; tax uuid; cid uuid; mid uuid:=gen_random_uuid(); doc jsonb; form jsonb; result jsonb; cycle jsonb; invoice uuid; blocked boolean:=false;
BEGIN
 SELECT p.* INTO actor FROM public.profiles p WHERE p.role='admin' AND EXISTS(SELECT 1 FROM public.quickbooks_settings q WHERE q.organization_id=p.organization_id) LIMIT 1;
 IF actor.id IS NULL THEN RAISE EXCEPTION 'Admin fixture unavailable'; END IF;
 org:=actor.organization_id;
 PERFORM set_config('request.jwt.claim.sub',actor.id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor.id,'role','authenticated')::text,true);
 SELECT * INTO ct FROM public.contacts WHERE organization_id=org AND office_id IS NOT NULL LIMIT 1;
 SELECT id INTO tpl FROM public.security_contract_templates WHERE organization_id=org AND is_active AND contract_terms NOT LIKE '%[LEGAL REVIEW:%' LIMIT 1;
 SELECT id INTO svc FROM public.monitoring_services WHERE organization_id=org AND is_active AND monthly_price>0 LIMIT 1;
 SELECT id INTO tax FROM public.tax_classifications WHERE organization_id=org AND is_active LIMIT 1;
 IF ct.id IS NULL OR tpl IS NULL OR svc IS NULL OR tax IS NULL THEN RAISE EXCEPTION 'Onboarding fixture unavailable'; END IF;
 result:=public.staff_security_onboarding('create',null,jsonb_build_object('request_id',gen_random_uuid(),'template_id',tpl,'contact_id',ct.id,'service_ids',jsonb_build_array(svc),'term_months',12,'account_type','residential'));
 cid:=(result->>'id')::uuid;
 INSERT INTO public.security_payment_methods(id,organization_id,contact_id,qbo_customer_id,qbo_method_id,payment_type,display_brand,display_last4,verified_at) VALUES(mid,org,ct.id,'rollback-only-customer','rollback-only-bank','ach','Test','1234',now());
 doc:=public.staff_security_onboarding('get',cid,'{}');
 form:=jsonb_build_object('personalInfo',jsonb_build_object('full_name','Rollback Billing Test','email','billing-test@example.com','phone','5551231234'),'propertyInfo',jsonb_build_object('address_line1','1 Main St','city','Topeka','state','KS','zip_code','66604'),'emergencyContacts',jsonb_build_array(jsonb_build_object('name','Test Contact','phone','5551111111','password','test-only','canAuthorize',true),jsonb_build_object('name','Test Contact Two','phone','5552222222','password','test-two','canAuthorize',false)),'paymentMethod','ach','paymentMethodId',mid,'billingPreference','monthly');
 PERFORM public.staff_security_onboarding('paper',cid,jsonb_build_object('paper_signed',true,'autopay_accepted',true,'document_version',doc->>'document_version','account_type','residential','form_data',form));
 PERFORM public.security_correct_onboarding(cid,0,jsonb_build_object('monitoring_tax_classification_id',tax),'Rollback test tax classification');
 PERFORM public.staff_security_onboarding('approve',cid,'{"revision":1}');
 BEGIN
  PERFORM public.staff_security_onboarding('activate',cid,jsonb_build_object('revision',1,'monitoring_start_date',(now() AT TIME ZONE 'America/Chicago')::date,'first_payment_date',(now() AT TIME ZONE 'America/Chicago')::date+15));
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'Connect QuickBooks with Payments permission%' THEN blocked:=true; ELSE RAISE; END IF; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Missing merchant setup did not block activation'; END IF;
 -- Temporary mock capability is transaction-only and invisible to the worker. No provider API is called.
 UPDATE public.quickbooks_settings SET payments_enabled=true,is_connected=true,security_monitoring_item_id='rollback-only-item' WHERE organization_id=org;
 UPDATE public.company_settings SET from_email='billing-test@example.com',company_email='billing-test@example.com' WHERE organization_id=org;
 PERFORM public.staff_security_onboarding('activate',cid,jsonb_build_object('revision',1,'monitoring_start_date',(now() AT TIME ZONE 'America/Chicago')::date,'first_payment_date',(now() AT TIME ZONE 'America/Chicago')::date+15));
 result:=public.security_recurring_billing('generate',null,'{}');
 IF (result->>'generated')::int<>1 THEN RAISE EXCEPTION 'Expected one invoice: %',result; END IF;
 result:=public.security_recurring_billing('generate',null,'{}'); IF (result->>'generated')::int<>0 THEN RAISE EXCEPTION 'Duplicate invoice generated'; END IF;
 SELECT invoice_id INTO invoice FROM public.security_billing_cycles WHERE contract_id=cid;
 IF NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=invoice AND created_by=actor.id AND invoice_number IS NOT NULL AND due_date=(now() AT TIME ZONE 'America/Chicago')::date+15) THEN RAISE EXCEPTION 'Invoice creator/number/date mismatch'; END IF;
 IF (SELECT sum(amount) FROM public.invoice_line_items WHERE invoice_id=invoice) IS DISTINCT FROM (SELECT subtotal FROM public.invoices WHERE id=invoice) THEN RAISE EXCEPTION 'Itemized costs do not equal invoice subtotal'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.invoice_line_items WHERE invoice_id=invoice AND description LIKE '% through %' AND description LIKE '%agreement %') THEN RAISE EXCEPTION 'Invoice lacks service period and agreement description'; END IF;
 cycle:=public.security_recurring_billing('lease',null,'{}');
 PERFORM public.security_recurring_billing('prepare',(cycle->>'id')::uuid,jsonb_build_object('lease_token',cycle->>'lease_token'));
 -- A tax review result is a valid safe stop; never bypass tax or invoke a charge in this audit.
 IF NOT EXISTS(SELECT 1 FROM public.security_billing_cycles WHERE contract_id=cid AND state='notice') THEN RAISE EXCEPTION 'Preparation did not reach notice or safe tax review'; END IF;

 -- Simulate provider outcomes strictly inside the rollback, exercising real ledger triggers without a merchant call.
 UPDATE public.security_billing_cycles SET state='processing',amount=(SELECT amount_due FROM public.invoices WHERE id=invoice),lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes' WHERE contract_id=cid;
 SELECT to_jsonb(b) INTO cycle FROM public.security_billing_cycles b WHERE contract_id=cid;
 PERFORM public.security_recurring_billing('result',(cycle->>'id')::uuid,jsonb_build_object('lease_token',cycle->>'lease_token','state','pending','processor_id','rollback-only-processor','processor_status','PENDING'));
 IF EXISTS(SELECT 1 FROM public.payments WHERE security_billing_cycle_id=(cycle->>'id')::uuid) THEN RAISE EXCEPTION 'Pending ACH was counted as paid'; END IF;
 UPDATE public.security_billing_cycles SET lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes' WHERE contract_id=cid;
 SELECT to_jsonb(b) INTO cycle FROM public.security_billing_cycles b WHERE contract_id=cid;
 PERFORM public.security_recurring_billing('result',(cycle->>'id')::uuid,jsonb_build_object('lease_token',cycle->>'lease_token','state','paid','processor_id','rollback-only-processor','processor_status','SETTLED'));
 IF (SELECT count(*) FROM public.payments WHERE security_billing_cycle_id=(cycle->>'id')::uuid)<>1 THEN RAISE EXCEPTION 'Confirmed payment ledger count mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.payments WHERE security_billing_cycle_id=(cycle->>'id')::uuid AND invoice_id=invoice) THEN RAISE EXCEPTION 'Confirmed receipt is not applied to its invoice'; END IF;
 blocked:=false;
 BEGIN
  INSERT INTO public.payments(invoice_id,organization_id,amount,payment_method,payment_processor,processor_transaction_id,security_billing_cycle_id)
   VALUES(gen_random_uuid(),org,(cycle->>'amount')::numeric,'qbo_payments','quickbooks','rollback-only-processor',(cycle->>'id')::uuid);
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'Automatic payment must match%' THEN blocked:=true; ELSE RAISE; END IF; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Unmatched automatic receipt was accepted'; END IF;
 IF (private.security_contract_summary(cid)->>'first_payment_made_at') IS NULL THEN RAISE EXCEPTION 'First confirmed payment date missing'; END IF;
 IF (SELECT amount_due FROM public.invoices WHERE id=invoice)<>0 THEN RAISE EXCEPTION 'Confirmed payment did not reduce invoice balance'; END IF;

END $test$;
ROLLBACK;
