-- Contract invitations remain contract-scoped; portal sessions use trusted contact ownership.
-- Privileged operations live in a non-exposed schema, behind a SECURITY INVOKER RPC.
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE public.security_onboarding_drafts (
  contract_id uuid PRIMARY KEY REFERENCES public.security_contracts(id) ON DELETE CASCADE,
  current_step integer NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 6),
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision bigint NOT NULL DEFAULT 0,
  saved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.security_onboarding_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_onboarding_drafts FROM PUBLIC, anon, authenticated;
ALTER TABLE public.security_contracts ADD COLUMN IF NOT EXISTS onboarding_agreement_snapshot jsonb;
ALTER TABLE public.security_contracts ADD COLUMN IF NOT EXISTS security_billing_mode text NOT NULL DEFAULT 'autopay' CHECK (security_billing_mode IN ('autopay','mail'));
ALTER TABLE public.security_contracts ADD COLUMN IF NOT EXISTS mail_invoice_fee numeric NOT NULL DEFAULT 0 CHECK (mail_invoice_fee IN (0,7));
ALTER TABLE public.security_contracts ADD COLUMN IF NOT EXISTS security_payment_method_id uuid;
ALTER TABLE public.security_contracts ADD COLUMN IF NOT EXISTS autopay_authorized_at timestamptz;
ALTER TABLE public.security_contracts ADD COLUMN IF NOT EXISTS mail_billing_authorized_by uuid;
ALTER TABLE public.security_contracts ADD COLUMN IF NOT EXISTS mail_billing_authorized_at timestamptz;
-- This table is populated only from authenticated QuickBooks Payments responses.
-- The old payment_methods table contains simulated Stripe IDs and is not trusted.
CREATE TABLE public.security_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  qbo_customer_id text NOT NULL, qbo_method_id text NOT NULL,
  payment_type text NOT NULL CHECK (payment_type IN ('card','ach')),
  display_brand text NOT NULL DEFAULT '', display_last4 text NOT NULL DEFAULT '',
  exp_month integer, exp_year integer, verified_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE(organization_id,contact_id,payment_type,qbo_method_id)
);
ALTER TABLE public.security_payment_methods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_payment_methods FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.security_payment_methods TO service_role;
ALTER TABLE public.security_contracts ADD CONSTRAINT security_contract_payment_fk FOREIGN KEY(security_payment_method_id) REFERENCES public.security_payment_methods(id);
ALTER TABLE public.qbo_oauth_sessions ADD COLUMN IF NOT EXISTS payments_requested boolean NOT NULL DEFAULT false;
ALTER TABLE public.quickbooks_settings ADD COLUMN IF NOT EXISTS payments_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION private.enforce_security_billing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_admin boolean; v_old_fee numeric := 0; v_changed boolean;
BEGIN
  IF TG_OP='INSERT' THEN v_changed := NEW.security_billing_mode='mail';
  ELSE v_old_fee := OLD.mail_invoice_fee; v_changed := NEW.security_billing_mode IS DISTINCT FROM OLD.security_billing_mode; END IF;
  IF v_changed THEN
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin' AND organization_id=NEW.organization_id) INTO v_admin;
    IF NOT v_admin THEN RAISE EXCEPTION 'Only an Admin may authorize mailed security invoices' USING ERRCODE='42501'; END IF;
    IF NEW.customer_completed_at IS NOT NULL THEN RAISE EXCEPTION 'Change billing before the customer signs, then send the updated agreement'; END IF;
    NEW.monthly_price := NEW.monthly_price + CASE WHEN NEW.security_billing_mode='mail' THEN 7 ELSE 0 END - v_old_fee;
    NEW.mail_billing_authorized_by := CASE WHEN NEW.security_billing_mode='mail' THEN auth.uid() END;
    NEW.mail_billing_authorized_at := CASE WHEN NEW.security_billing_mode='mail' THEN now() END;
  ELSIF TG_OP='UPDATE' THEN
    NEW.mail_billing_authorized_by := OLD.mail_billing_authorized_by;
    NEW.mail_billing_authorized_at := OLD.mail_billing_authorized_at;
  END IF;
  NEW.mail_invoice_fee := CASE WHEN NEW.security_billing_mode='mail' THEN 7 ELSE 0 END;
  -- New portal agreements cannot be activated by bypassing the payment step.
  IF TG_OP='UPDATE' AND NEW.status IN ('approved','active') AND NEW.status IS DISTINCT FROM OLD.status
    AND coalesce(NEW.agreement_type,'monitoring')='monitoring' AND NEW.security_billing_mode='autopay' THEN
    IF NEW.autopay_authorized_at IS NULL OR NOT EXISTS(SELECT 1 FROM public.security_payment_methods m
      WHERE m.id=NEW.security_payment_method_id AND m.contact_id=NEW.contact_id AND m.organization_id=NEW.organization_id AND m.is_active) THEN
      RAISE EXCEPTION 'A verified payment method and AutoPay authorization are required';
    END IF;
  END IF;
  IF TG_OP='UPDATE' AND current_setting('mjv.security_signing',true) IS DISTINCT FROM 'true'
    AND (NEW.onboarding_agreement_snapshot IS DISTINCT FROM OLD.onboarding_agreement_snapshot
      OR NEW.autopay_authorized_at IS DISTINCT FROM OLD.autopay_authorized_at
      OR NEW.security_payment_method_id IS DISTINCT FROM OLD.security_payment_method_id) THEN
    RAISE EXCEPTION 'Signed agreement and payment authorization must be recorded through onboarding';
  END IF;
  IF TG_OP='UPDATE' AND OLD.onboarding_agreement_snapshot IS NOT NULL AND current_setting('mjv.security_signing',true) IS DISTINCT FROM 'true'
    AND (NEW.customer_signature IS DISTINCT FROM OLD.customer_signature OR NEW.customer_signature_date IS DISTINCT FROM OLD.customer_signature_date
      OR NEW.customer_completed_at IS DISTINCT FROM OLD.customer_completed_at) THEN
    RAISE EXCEPTION 'The accepted signature and signing time cannot be changed';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.enforce_security_billing() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER enforce_security_billing BEFORE INSERT OR UPDATE ON public.security_contracts FOR EACH ROW EXECUTE FUNCTION private.enforce_security_billing();

CREATE OR REPLACE FUNCTION private.security_customer_owns(p_contact_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.contacts c WHERE c.id = p_contact_id AND (
      c.portal_user_id = auth.uid()
    )
  );
$$;
REVOKE ALL ON FUNCTION private.security_customer_owns(uuid) FROM PUBLIC, anon, authenticated;

-- The allowlist is enforced on the server as well as the client. Never persist a
-- submitted arbitrary JSON object: it may contain PAN, CVV, bank details or a signature.
CREATE OR REPLACE FUNCTION private.security_safe_draft(p_form jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'personalInfo', jsonb_build_object(
      'full_name', left(coalesce(p_form->'personalInfo'->>'full_name', ''), 200),
      'email', left(coalesce(p_form->'personalInfo'->>'email', ''), 254),
      'phone', left(coalesce(p_form->'personalInfo'->>'phone', ''), 40)),
    'propertyInfo', jsonb_build_object(
      'address_line1', left(coalesce(p_form->'propertyInfo'->>'address_line1', ''), 300),
      'city', left(coalesce(p_form->'propertyInfo'->>'city', ''), 100),
      'state', left(coalesce(p_form->'propertyInfo'->>'state', ''), 2),
      'zip_code', left(coalesce(p_form->'propertyInfo'->>'zip_code', ''), 20)),
    'emergencyContacts', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'name', left(coalesce(e->>'name', ''), 200),
      'phone', left(coalesce(e->>'phone', ''), 40),
      'password', left(coalesce(e->>'password', ''), 100),
      'canAuthorize', coalesce(e->>'canAuthorize', 'false') = 'true') ORDER BY ord)
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_form->'emergencyContacts') = 'array'
        THEN p_form->'emergencyContacts' ELSE '[]'::jsonb END) WITH ORDINALITY AS x(e,ord)
      WHERE ord <= 10), '[]'::jsonb),
    'paymentMethodId', CASE WHEN coalesce(p_form->>'paymentMethodId','') ~ '^[0-9a-fA-F-]{36}$' THEN p_form->>'paymentMethodId' ELSE '' END,
    'paymentMethod', CASE WHEN p_form->>'paymentMethod' IN ('credit_card','ach')
      THEN p_form->>'paymentMethod' ELSE '' END,
    'billingPreference', CASE WHEN p_form->>'billingPreference' = 'annual' THEN 'annual' ELSE 'monthly' END
  );
$$;
REVOKE ALL ON FUNCTION private.security_safe_draft(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.portal_security_onboarding(
  p_action text, p_contract_id uuid, p_token text, p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_contract public.security_contracts%ROWTYPE;
  v_draft public.security_onboarding_drafts%ROWTYPE;
  v_contact jsonb; v_template jsonb; v_settings jsonb; v_services jsonb;
  v_document jsonb; v_form jsonb; v_version text; v_ec jsonb; v_ord bigint;
  v_method public.security_payment_methods%ROWTYPE;
  v_authorization text := 'I authorize MyJobView to initiate recurring automatic charges or ACH debits through QuickBooks Payments to my selected payment method for security monitoring, at the billing frequency and amounts shown in this agreement, plus applicable taxes disclosed on invoices. Billing begins when monitoring is activated. Invoices identify the payment amount and scheduled debit date and are sent at least 10 days before an automatic debit. Monthly or annual billing periods recur from the activation date; short months use the last day of the month. This authorization continues until revoked. Contact the provider using the contact information in this agreement to revoke or change payment authorization before the next scheduled payment. Revoking AutoPay does not cancel the monitoring agreement or amounts owed.';
BEGIN
  IF p_action = 'list' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in to view your agreements' USING ERRCODE='42501'; END IF;
    RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', sc.id, 'contract_number', sc.contract_number, 'status', sc.status,
      'monthly_price', sc.monthly_price, 'customer_completed_at', sc.customer_completed_at,
      'saved_at', d.saved_at, 'current_step', coalesce(d.current_step,1)) ORDER BY sc.created_at DESC)
      FROM public.security_contracts sc LEFT JOIN public.security_onboarding_drafts d ON d.contract_id=sc.id
      WHERE private.security_customer_owns(sc.contact_id)
        AND sc.status IN ('pending_customer','customer_completed','pending_approval','approved','active','cancelled')
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
    ('pending_customer','customer_completed','pending_approval','approved','active','cancelled') THEN
    RAISE EXCEPTION 'Invalid or expired invitation link. Sign in to your portal or request a new invitation.' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object('full_name',c.full_name,'email',c.email,'phone',c.phone,
    'address_line1',c.street_address,'city',c.city,'state',c.state,'zip_code',c.zip_code)
    INTO v_contact FROM public.contacts c WHERE c.id=v_contract.contact_id AND c.organization_id=v_contract.organization_id;
  SELECT jsonb_build_object('name',t.name,'contract_terms',t.contract_terms) INTO v_template
    FROM public.security_contract_templates t WHERE t.id=v_contract.template_id AND t.organization_id=v_contract.organization_id;
  SELECT jsonb_build_object('company_name',cs.company_name,'company_email',cs.company_email,
    'annual_billing_enabled',cs.annual_billing_enabled,'default_billing_preference',cs.default_billing_preference,
    'annual_discount_type',cs.annual_discount_type,'annual_discount_percentage',cs.annual_discount_percentage,
    'annual_discount_flat_amount',cs.annual_discount_flat_amount) INTO v_settings
    FROM public.company_settings cs WHERE cs.organization_id=v_contract.organization_id LIMIT 1;
  SELECT coalesce(jsonb_agg(jsonb_build_object('name',ms.name,'monthly_price',s.monthly_price) ORDER BY ms.name,s.id),'[]'::jsonb)
    INTO v_services FROM public.security_contract_services s JOIN public.monitoring_services ms ON ms.id=s.service_id
    WHERE s.contract_id=v_contract.id;
  v_document := jsonb_build_object('contract_number',v_contract.contract_number,'monthly_price',v_contract.monthly_price,
    'term_months',v_contract.term_months,'renewal_term_months',v_contract.renewal_term_months,
    'cancellation_notice_days',v_contract.cancellation_notice_days,'template',v_template,
    'dealer',v_settings,'services',v_services,'billing_mode',v_contract.security_billing_mode,
    'mail_invoice_fee',v_contract.mail_invoice_fee,
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
  v_document := v_document || jsonb_build_object('personalInfo',v_form->'personalInfo',
    'propertyInfo',v_form->'propertyInfo','paymentMethod',v_form->>'paymentMethod',
    'payment_display',CASE WHEN v_method.id IS NOT NULL THEN v_method.display_brand || ' ending ' || v_method.display_last4 ELSE 'Admin-approved mailed invoices' END,
    'billingPreference',v_form->>'billingPreference','accepted_at',now(),'document_version',v_version);
  PERFORM set_config('mjv.security_signing','true',true);
  UPDATE public.security_contracts SET status='pending_approval',customer_completed_at=now(),
    customer_signature=p_payload->>'signature',customer_signature_date=now(),
    payment_method=nullif(v_form->>'paymentMethod',''),billing_frequency_override=CASE WHEN v_form->>'billingPreference'='annual' THEN 'yearly' ELSE 'monthly' END,
    security_payment_method_id=v_method.id,autopay_authorized_at=CASE WHEN v_method.id IS NOT NULL THEN now() END,
    onboarding_agreement_snapshot=v_document,updated_at=now() WHERE id=v_contract.id;
  PERFORM set_config('mjv.security_signing','false',true);
  DELETE FROM public.security_onboarding_drafts WHERE contract_id=v_contract.id;
  RETURN jsonb_build_object('success',true);
END;
$$;
REVOKE ALL ON FUNCTION private.portal_security_onboarding(text,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.portal_security_onboarding(text,uuid,text,jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.portal_security_onboarding(
  p_action text, p_contract_id uuid DEFAULT NULL, p_token text DEFAULT NULL, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.portal_security_onboarding(p_action,p_contract_id,p_token,p_payload);
$$;
REVOKE ALL ON FUNCTION public.portal_security_onboarding(text,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_security_onboarding(text,uuid,text,jsonb) TO anon, authenticated;

-- Replace token-existence policies. The new endpoint validates actual possession.
DROP POLICY IF EXISTS "Anonymous users can view contracts via magic link" ON public.security_contracts;
DROP POLICY IF EXISTS "Anonymous users can update contracts via magic link" ON public.security_contracts;
DROP POLICY IF EXISTS "Anonymous users can view specific contacts" ON public.contacts;
DROP POLICY IF EXISTS "Anon can update contact via security contract magic link" ON public.contacts;
DROP POLICY IF EXISTS "Anon can insert onboarding progress via magic link" ON public.onboarding_progress;
DROP POLICY IF EXISTS "Anon can select onboarding progress via magic link" ON public.onboarding_progress;
DROP POLICY IF EXISTS "Anon can update onboarding progress via magic link" ON public.onboarding_progress;
DROP POLICY IF EXISTS "Anon can insert emergency contacts via magic link" ON public.security_contract_emergency_contacts;
DROP POLICY IF EXISTS "Anonymous users can insert contract fields" ON public.security_contract_fields;
DROP POLICY IF EXISTS "Anonymous users can update contract fields" ON public.security_contract_fields;
-- The legacy write path cannot bypass the immutable-copy and server-validation flow.
DO $$ BEGIN
  IF to_regprocedure('public.submit_security_onboarding(text,text,text,text,text,text,text,text,text,text,text,text,text,jsonb)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.submit_security_onboarding(text,text,text,text,text,text,text,text,text,text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
