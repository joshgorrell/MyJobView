-- Based on deployed onboarding core; retain existing portal wrapper.
CREATE OR REPLACE FUNCTION private.security_onboarding_core(p_action text, p_contract_id uuid, p_token text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_contract public.security_contracts%ROWTYPE;
  v_draft public.security_onboarding_drafts%ROWTYPE;
  v_contact jsonb; v_template jsonb; v_settings jsonb; v_services jsonb;
  v_document jsonb; v_form jsonb; v_version text; v_ec jsonb; v_ord bigint;
  v_method public.security_payment_methods%ROWTYPE;
  v_authorization text := private.security_autopay_authorization();
BEGIN
  IF p_action = 'list' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in to view your agreements' USING ERRCODE='42501'; END IF;
    RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', sc.id, 'contract_number', sc.contract_number, 'status', sc.status,
      'monthly_price', sc.monthly_price, 'customer_completed_at', sc.customer_completed_at,
      'saved_at', d.saved_at, 'current_step', coalesce(d.current_step,1)) ORDER BY sc.created_at DESC)
      FROM public.security_contracts sc LEFT JOIN public.security_onboarding_drafts d ON d.contract_id=sc.id
      WHERE private.security_customer_owns(sc.contact_id)
        AND sc.status IN ('pending_customer','customer_completed','pending_approval','approved','active','cancelled','rejected')
    ), '[]'::jsonb);
  END IF;
  IF coalesce(p_action,'') NOT IN ('get','save','submit') THEN RAISE EXCEPTION 'Unsupported operation'; END IF;
  -- Lock serializes submit/save/replay and makes revision checks atomic.
  IF nullif(p_token,'') IS NOT NULL THEN
    BEGIN
      SELECT * INTO v_contract FROM public.security_contracts
        WHERE magic_link_token=p_token::uuid AND magic_link_expires_at>now()
          AND (p_contract_id IS NULL OR id=p_contract_id) FOR UPDATE;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid or expired invitation link' USING ERRCODE='42501';
    END;
  ELSE
    SELECT * INTO v_contract FROM public.security_contracts
      WHERE id=p_contract_id AND private.security_customer_owns(contact_id) FOR UPDATE;
  END IF;
  IF v_contract.id IS NULL OR v_contract.status NOT IN
    ('pending_customer','customer_completed','pending_approval','approved','active','cancelled','rejected') THEN
    RAISE EXCEPTION 'Invalid or expired invitation link. Sign in to your portal or request a new invitation.' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object('full_name',c.full_name,'email',c.email,'phone',c.phone,
    'address_line1',c.street_address,'city',c.city,'state',c.state,'zip_code',c.zip_code)
    INTO v_contact FROM public.contacts c WHERE c.id=v_contract.contact_id AND c.organization_id=v_contract.organization_id;
  SELECT jsonb_build_object('name',t.name,'contract_terms',t.contract_terms) INTO v_template
    FROM public.security_contract_templates t WHERE t.id=v_contract.template_id AND t.organization_id=v_contract.organization_id;
  SELECT jsonb_build_object('company_name',cs.company_name,'company_email',cs.company_email,
    'annual_billing_enabled',cs.annual_billing_enabled,'default_billing_preference',cs.default_billing_preference) INTO v_settings
    FROM public.company_settings cs WHERE cs.organization_id=v_contract.organization_id LIMIT 1;
  SELECT coalesce(jsonb_agg(jsonb_build_object('service_id',ms.id,'name',ms.name,'monthly_price',s.monthly_price) ORDER BY ms.name,s.id),'[]'::jsonb)
    INTO v_services FROM public.security_contract_services s JOIN public.monitoring_services ms ON ms.id=s.service_id
    WHERE s.contract_id=v_contract.id;
  v_document := jsonb_build_object('contract_number',v_contract.contract_number,'monthly_price',v_contract.monthly_price,
    'term_months',v_contract.term_months,'renewal_term_months',v_contract.renewal_term_months,
    'cancellation_notice_days',v_contract.cancellation_notice_days,'template',v_template,
    'dealer',v_settings,'services',v_services,'billing_mode',v_contract.security_billing_mode,
    'mail_invoice_fee',v_contract.mail_invoice_fee,
    'mailed_paper_statements',v_contract.mailed_paper_statements,
    'autopay_authorization',CASE WHEN v_contract.security_billing_mode='autopay' THEN v_authorization ELSE NULL END);
  v_version := md5(v_document::text);
  SELECT * INTO v_draft FROM public.security_onboarding_drafts WHERE contract_id=v_contract.id;
  IF p_action='get' THEN
    RETURN jsonb_build_object('id',v_contract.id,'status',v_contract.status,'contact',v_contact,
      'document',coalesce(v_contract.onboarding_agreement_snapshot,v_document),'document_version',v_version,
      'signed_snapshot_available',v_contract.onboarding_agreement_snapshot IS NOT NULL,
      'customer_signature',CASE WHEN v_contract.onboarding_agreement_snapshot IS NOT NULL THEN v_contract.customer_signature END,
      'customer_signature_date',v_contract.customer_signature_date,'customer_completed_at',v_contract.customer_completed_at,
      'draft',CASE WHEN v_contract.customer_completed_at IS NULL THEN jsonb_build_object(
        'form_data',v_draft.form_data,'current_step',coalesce(v_draft.current_step,1),
        'revision',coalesce(v_draft.revision,0),'saved_at',v_draft.saved_at) ELSE NULL END);
  END IF;
  IF p_action='submit' AND coalesce(v_template->>'contract_terms','') LIKE '%[LEGAL REVIEW:%' THEN
    RAISE EXCEPTION 'This agreement is awaiting legal review and cannot be signed yet';
  END IF;
  IF v_contract.status NOT IN ('pending_customer','customer_completed') OR v_contract.customer_completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This agreement has already been submitted. Reload to view your copy.' USING ERRCODE='40001';
  END IF;
  IF octet_length(coalesce(p_payload::text,''))>150000 THEN RAISE EXCEPTION 'Request is too large'; END IF;
  IF coalesce((p_payload->>'revision')::bigint,-1)<>coalesce(v_draft.revision,0) THEN
    RAISE EXCEPTION 'Your agreement was updated in another window. Reload before continuing.' USING ERRCODE='40001';
  END IF;
  v_form := private.security_safe_draft(p_payload->'form_data');
  IF p_action='save' THEN
    INSERT INTO public.security_onboarding_drafts(contract_id,current_step,form_data,revision,saved_at)
      VALUES(v_contract.id,(p_payload->>'current_step')::integer,v_form,coalesce(v_draft.revision,0)+1,now())
      ON CONFLICT(contract_id) DO UPDATE SET current_step=excluded.current_step,form_data=excluded.form_data,
        revision=excluded.revision,saved_at=excluded.saved_at;
    RETURN jsonb_build_object('revision',coalesce(v_draft.revision,0)+1,'saved_at',now());
  END IF;
  IF p_payload->>'document_version' IS DISTINCT FROM v_version THEN
    RAISE EXCEPTION 'Agreement terms have changed. Reload and review them before signing.' USING ERRCODE='40001';
  END IF;
  IF nullif(btrim(v_template->>'contract_terms'),'') IS NULL THEN RAISE EXCEPTION 'Agreement terms are unavailable. Contact your provider.'; END IF;
  IF coalesce(p_payload->>'accepted','false')<>'true' OR coalesce(p_payload->>'signature','') !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' THEN
    RAISE EXCEPTION 'Review and sign the agreement before submitting';
  END IF;
  IF nullif(btrim(v_form->'personalInfo'->>'full_name'),'') IS NULL
    OR nullif(btrim(v_form->'personalInfo'->>'email'),'') IS NULL
    OR nullif(btrim(v_form->'personalInfo'->>'phone'),'') IS NULL
    OR nullif(btrim(v_form->'propertyInfo'->>'address_line1'),'') IS NULL
    OR nullif(btrim(v_form->'propertyInfo'->>'city'),'') IS NULL
    OR length(v_form->'propertyInfo'->>'state')<>2
    OR nullif(btrim(v_form->'propertyInfo'->>'zip_code'),'') IS NULL
    OR jsonb_array_length(v_form->'emergencyContacts')<2 THEN RAISE EXCEPTION 'Complete all required information'; END IF;
  IF v_contract.security_billing_mode='autopay' THEN
    SELECT * INTO v_method FROM public.security_payment_methods WHERE id=nullif(v_form->>'paymentMethodId','')::uuid
      AND organization_id=v_contract.organization_id AND contact_id=v_contract.contact_id
      AND is_active AND verified_at>now()-interval '5 minutes'
      AND (payment_type='ach' OR (exp_year>extract(year from now()) OR (exp_year=extract(year from now()) AND exp_month>=extract(month from now()))));
    IF v_method.id IS NULL OR coalesce(p_payload->>'autopay_accepted','false')<>'true' THEN
      RAISE EXCEPTION 'Select a verified payment method and authorize recurring automatic payments';
    END IF;
    v_form := v_form || jsonb_build_object('paymentMethod',CASE WHEN v_method.payment_type='card' THEN 'credit_card' ELSE 'ach' END);
  ELSE
    v_form := v_form || jsonb_build_object('paymentMethod','','paymentMethodId','');
  END IF;
  IF v_contract.security_billing_mode='mail' AND v_form->>'mailedPaperStatements'<>'true' THEN
    RAISE EXCEPTION 'Admin-approved manual billing requires mailed paper statements';
  END IF;
  IF v_form->>'billingPreference'='annual' AND coalesce(v_settings->>'annual_billing_enabled','false')<>'true' THEN
    RAISE EXCEPTION 'Annual billing is not available';
  END IF;
  FOR v_ec,v_ord IN SELECT e,ord FROM jsonb_array_elements(v_form->'emergencyContacts') WITH ORDINALITY x(e,ord) LOOP
    IF nullif(btrim(v_ec->>'name'),'') IS NULL OR nullif(btrim(v_ec->>'phone'),'') IS NULL
      OR nullif(btrim(v_ec->>'password'),'') IS NULL THEN RAISE EXCEPTION 'Complete every emergency contact'; END IF;
    INSERT INTO public.security_contract_emergency_contacts(contract_id,organization_id,contact_name,phone_number,
      password_codeword,can_authorize_entry,priority_order) VALUES(v_contract.id,v_contract.organization_id,
      v_ec->>'name',v_ec->>'phone',v_ec->>'password',(v_ec->>'canAuthorize')::boolean,v_ord);
  END LOOP;
  -- Preserve what the signer accepted, independently of later template/contact edits.
  v_document := v_document || jsonb_build_object(
    'mailed_paper_statements',(v_form->>'mailedPaperStatements')::boolean,
    'mail_invoice_fee',CASE WHEN v_form->>'mailedPaperStatements'='true' THEN 5 ELSE 0 END,
    'monthly_price',v_contract.monthly_price + (CASE WHEN v_form->>'mailedPaperStatements'='true' THEN 5 ELSE 0 END) - v_contract.mail_invoice_fee,
    'personalInfo',v_form->'personalInfo',
    'propertyInfo',v_form->'propertyInfo','paymentMethod',v_form->>'paymentMethod',
    'payment_display',CASE WHEN v_method.id IS NOT NULL THEN v_method.display_brand || ' ending ' || v_method.display_last4 ELSE 'Admin-approved mailed invoices' END,
    'billingPreference',v_form->>'billingPreference','accepted_at',now(),'document_version',v_version);
  PERFORM set_config('mjv.security_signing','true',true);
  UPDATE public.security_contracts SET status='pending_approval',customer_completed_at=now(),
    customer_signature=p_payload->>'signature',customer_signature_date=now(),
    payment_method=nullif(v_form->>'paymentMethod',''),billing_frequency_override=CASE WHEN v_form->>'billingPreference'='annual' THEN 'yearly' ELSE 'monthly' END,
    security_payment_method_id=v_method.id,autopay_authorized_at=CASE WHEN v_method.id IS NOT NULL THEN now() END,
    mailed_paper_statements=(v_form->>'mailedPaperStatements')::boolean,
    onboarding_agreement_snapshot=v_document,updated_at=now() WHERE id=v_contract.id;
  PERFORM set_config('mjv.security_signing','false',true);
  DELETE FROM public.security_onboarding_drafts WHERE contract_id=v_contract.id;
  RETURN jsonb_build_object('success',true);
END;
$function$
;
