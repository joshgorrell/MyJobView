ALTER TABLE public.company_settings ADD COLUMN portal_security_contracts_enabled boolean NOT NULL DEFAULT true;

CREATE FUNCTION private.security_portal_enabled(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.department_modules WHERE organization_id=p_org AND module_key='contract_management' AND is_active)
   AND EXISTS(SELECT 1 FROM public.company_settings WHERE organization_id=p_org AND portal_security_contracts_enabled);
$$;
REVOKE ALL ON FUNCTION private.security_portal_enabled(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.security_portal_enabled_for_customer()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.contacts WHERE portal_user_id=auth.uid() AND private.security_portal_enabled(organization_id));
$$;
REVOKE ALL ON FUNCTION private.security_portal_enabled_for_customer() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.security_portal_enabled_for_customer() TO anon,authenticated;
CREATE FUNCTION public.security_portal_enabled()
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.security_portal_enabled_for_customer(); $$;
REVOKE ALL ON FUNCTION public.security_portal_enabled() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.security_portal_enabled() TO anon,authenticated;

CREATE FUNCTION private.security_contract_summary(p_contract uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.security_contracts%ROWTYPE; v_start date; v_end date; v_today date := (now() AT TIME ZONE 'America/Chicago')::date;
  v_term integer; v_age interval; v_remaining integer; v_due numeric; v_pending numeric; v_next timestamptz;
BEGIN
 SELECT * INTO c FROM public.security_contracts WHERE id=p_contract;
 v_start := coalesce(c.security_billing_anchor,(c.activated_at AT TIME ZONE 'America/Chicago')::date);
 v_term := coalesce((c.onboarding_agreement_snapshot->>'term_months')::integer,c.term_months);
 IF v_start IS NOT NULL THEN
   v_end := private.security_period_date(v_start,v_term,1);
   v_age := age(v_end,v_today);
   v_remaining := greatest(0,extract(year from v_age)::integer*12+extract(month from v_age)::integer+CASE WHEN extract(day from v_age)>0 THEN 1 ELSE 0 END);
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
REVOKE ALL ON FUNCTION private.security_contract_summary(uuid) FROM PUBLIC,anon,authenticated;

ALTER FUNCTION private.portal_security_onboarding(text,uuid,text,jsonb) RENAME TO security_onboarding_core;
REVOKE ALL ON FUNCTION private.security_onboarding_core(text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.portal_security_onboarding(p_action text,p_contract_id uuid,p_token text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb; v_item jsonb; v_list jsonb := '[]'; v_org uuid; v_id uuid;
BEGIN
 IF p_action='list' THEN
   v_result := private.security_onboarding_core('list',NULL,NULL,'{}');
   FOR v_item IN SELECT * FROM jsonb_array_elements(v_result) LOOP
     SELECT organization_id INTO v_org FROM public.security_contracts WHERE id=(v_item->>'id')::uuid;
     IF private.security_portal_enabled(v_org) THEN v_list := v_list || jsonb_build_array(v_item || jsonb_build_object('summary',private.security_contract_summary((v_item->>'id')::uuid))); END IF;
   END LOOP;
   RETURN v_list;
 END IF;
 v_result := private.security_onboarding_core('get',p_contract_id,p_token,'{}');
 v_id := (v_result->>'id')::uuid;
 SELECT organization_id INTO v_org FROM public.security_contracts WHERE id=v_id;
 IF nullif(p_token,'') IS NULL AND NOT private.security_portal_enabled(v_org) THEN
   RAISE EXCEPTION 'The security contracts portal module is not enabled' USING ERRCODE='42501';
 END IF;
 IF p_action='get' THEN
   RETURN v_result || jsonb_build_object('portal_module_enabled',private.security_portal_enabled(v_org),
     'summary',CASE WHEN private.security_portal_enabled(v_org) THEN private.security_contract_summary(v_id) END);
 END IF;
 IF p_action='revoke_autopay' THEN
   IF v_result->>'customer_completed_at' IS NULL THEN RAISE EXCEPTION 'There is no signed payment authorization to revoke'; END IF;
   UPDATE public.security_contracts SET autopay_paused=true,autopay_revoked_at=now(),updated_at=now() WHERE id=v_id;
   RETURN jsonb_build_object('success',true);
 END IF;
 RETURN private.security_onboarding_core(p_action,p_contract_id,p_token,p_payload);
END $$;
REVOKE ALL ON FUNCTION private.portal_security_onboarding(text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.portal_security_onboarding(text,uuid,text,jsonb) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.portal_security_onboarding(p_action text,p_contract_id uuid DEFAULT NULL,p_token text DEFAULT NULL,p_payload jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.portal_security_onboarding(p_action,p_contract_id,p_token,p_payload); $$;

CREATE TABLE public.security_billing_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cycle_id uuid NOT NULL REFERENCES public.security_billing_cycles(id),
 organization_id uuid NOT NULL,actor_id uuid NOT NULL,action text NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.security_billing_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_billing_reviews FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.security_billing_reviews TO authenticated;
CREATE POLICY security_billing_reviews_read ON public.security_billing_reviews FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND organization_id=security_billing_reviews.organization_id AND role IN ('admin','finance')));
CREATE FUNCTION private.security_billing_review(p_action text,p_id uuid,p_reason text,p_processor_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.security_billing_cycles%ROWTYPE;
BEGIN
 SELECT * INTO b FROM public.security_billing_cycles WHERE id=p_id FOR UPDATE;
 IF b.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND organization_id=b.organization_id AND role='admin') THEN
   RAISE EXCEPTION 'Only an Admin for this organization can resolve billing exceptions' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_reason,'')))<10 THEN RAISE EXCEPTION 'Record the merchant verification and reference before continuing'; END IF;
 IF b.state NOT IN ('declined','unknown','review') THEN RAISE EXCEPTION 'This billing cycle is not available for review'; END IF;
 IF p_action='reconcile' AND nullif(p_processor_id,'') IS NOT NULL THEN
   UPDATE public.security_billing_cycles SET state='pending',processor_id=left(p_processor_id,100),next_check_at=now(),lease_token=NULL,lease_until=NULL,last_message='Admin requested provider verification' WHERE id=b.id;
 ELSIF p_action='retry_confirmed_no_charge' AND (b.processor_id IS NULL OR b.state='declined') THEN
   UPDATE public.security_billing_cycles SET state=CASE WHEN amount IS NULL THEN 'preparing' ELSE 'notice' END,processor_id=NULL,processor_status=NULL,
     notice_sent_at=NULL,debit_after=NULL,next_check_at=now(),lease_token=NULL,lease_until=NULL,last_message='Admin verified no charge; a new advance notice is required' WHERE id=b.id;
 ELSE RAISE EXCEPTION 'Verify the known provider transaction before authorizing a retry'; END IF;
 INSERT INTO public.security_billing_reviews(cycle_id,organization_id,actor_id,action,reason) VALUES(b.id,b.organization_id,auth.uid(),p_action,left(p_reason,1000));
 RETURN jsonb_build_object('success',true);
END $$;
REVOKE ALL ON FUNCTION private.security_billing_review(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.security_billing_review(text,uuid,text,text) TO authenticated;
CREATE FUNCTION public.security_billing_review(p_action text,p_id uuid,p_reason text,p_processor_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.security_billing_review(p_action,p_id,p_reason,p_processor_id); $$;
REVOKE ALL ON FUNCTION public.security_billing_review(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.security_billing_review(text,uuid,text,text) TO authenticated;
