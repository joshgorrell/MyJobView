-- Optional service intake gate. No deposit, charge, invoice or AutoPay enrollment.
CREATE SCHEMA IF NOT EXISTS private;
ALTER TABLE public.service_requests
 ADD COLUMN service_approval_required boolean NOT NULL DEFAULT false,
 ADD COLUMN service_terms text NOT NULL DEFAULT '',
 ADD COLUMN service_approval_version uuid NOT NULL DEFAULT gen_random_uuid(),
 ADD COLUMN service_accepted_at timestamptz,
 ADD COLUMN service_accepted_by text,
 ADD COLUMN service_payment_method_id uuid REFERENCES public.security_payment_methods(id),
 ADD COLUMN service_waived_at timestamptz,
 ADD COLUMN service_waived_by uuid REFERENCES public.profiles(id),
 ADD COLUMN service_waiver_reason text;
ALTER TABLE public.service_requests DROP CONSTRAINT service_requests_status_check;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_status_check
 CHECK(status IN ('open','pending_customer','scheduled','in_progress','closed','cancelled','needs_more_info'));
CREATE TABLE private.service_approval_invitations (
 id uuid PRIMARY KEY,
 request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL,
 version uuid NOT NULL,
 token text NOT NULL UNIQUE DEFAULT (gen_random_uuid()::text || gen_random_uuid()::text),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '14 days',
 created_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz, provider_id text
);
ALTER TABLE private.service_approval_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.service_approval_invitations FROM PUBLIC,anon,authenticated;
GRANT ALL ON private.service_approval_invitations TO service_role;
CREATE TABLE public.service_approval_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES public.service_requests(id),
 organization_id uuid NOT NULL,
 event_type text NOT NULL CHECK(event_type IN ('required','accepted','payment_verified','waived','revised')),
 actor_id uuid, actor_name text, reason text, terms text NOT NULL,
 version uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.service_approval_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_approval_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.service_approval_events TO authenticated;
CREATE POLICY service_approval_staff_read ON public.service_approval_events FOR SELECT TO authenticated
 USING (organization_id=public.get_user_org_id() AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND role<>'portal'));

CREATE OR REPLACE FUNCTION private.service_approval_ready(r public.service_requests)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT NOT r.service_approval_required OR r.service_waived_at IS NOT NULL OR
 (r.service_accepted_at IS NOT NULL AND EXISTS(SELECT 1 FROM public.security_payment_methods m
 WHERE m.id=r.service_payment_method_id AND m.organization_id=r.organization_id AND m.contact_id=r.contact_id AND m.is_active
 AND (m.payment_type='ach' OR (m.exp_year*12+m.exp_month >= extract(year FROM current_date)::int*12+extract(month FROM current_date)::int))));
$$;
REVOKE ALL ON FUNCTION private.service_approval_ready(public.service_requests) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.guard_service_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE internal boolean:=current_setting('mjv.service_approval',true)='true'; revised boolean:=false;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.service_accepted_at IS NOT NULL OR NEW.service_payment_method_id IS NOT NULL OR NEW.service_waived_at IS NOT NULL
   OR NEW.service_waived_by IS NOT NULL OR NEW.service_waiver_reason IS NOT NULL OR NEW.service_accepted_by IS NOT NULL THEN
   RAISE EXCEPTION 'Approval must be recorded through the service approval workflow'; END IF;
  NEW.service_approval_version:=gen_random_uuid();
 ELSE
  IF NOT coalesce(internal,false) AND
    (NEW.service_accepted_at,NEW.service_accepted_by,NEW.service_payment_method_id,NEW.service_waived_at,NEW.service_waived_by,NEW.service_waiver_reason,NEW.service_approval_version)
    IS DISTINCT FROM (OLD.service_accepted_at,OLD.service_accepted_by,OLD.service_payment_method_id,OLD.service_waived_at,OLD.service_waived_by,OLD.service_waiver_reason,OLD.service_approval_version)
   THEN RAISE EXCEPTION 'Approval must be recorded through the service approval workflow'; END IF;
  IF OLD.service_approval_required AND NOT NEW.service_approval_required THEN
   RAISE EXCEPTION 'Use Override & Allow Scheduling to waive this requirement'; END IF;
  revised:=NEW.service_approval_required AND
   (NEW.service_approval_required,NEW.service_terms,NEW.contact_id,NEW.customer_email,NEW.job_description,NEW.job_location_address,NEW.job_location_city,NEW.job_location_state,NEW.job_location_zip)
   IS DISTINCT FROM (OLD.service_approval_required,OLD.service_terms,OLD.contact_id,OLD.customer_email,OLD.job_description,OLD.job_location_address,OLD.job_location_city,OLD.job_location_state,OLD.job_location_zip);
  IF revised THEN
   IF OLD.work_order_id IS NOT NULL OR OLD.status IN ('scheduled','in_progress','closed','cancelled') THEN RAISE EXCEPTION 'Revise service approval before scheduling'; END IF;
   NEW.service_approval_version:=gen_random_uuid();NEW.service_accepted_at:=NULL;NEW.service_accepted_by:=NULL;
   NEW.service_payment_method_id:=NULL;NEW.service_waived_at:=NULL;NEW.service_waived_by:=NULL;NEW.service_waiver_reason:=NULL;
  END IF;
 END IF;
 IF NEW.service_approval_required THEN
  IF TG_OP='INSERT' OR revised THEN
   IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND organization_id=NEW.organization_id AND is_active AND role<>'portal') THEN RAISE EXCEPTION 'Active staff access required'; END IF;
   IF coalesce(NEW.request_type,'service')<>'service' OR NEW.contact_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.contacts WHERE id=NEW.contact_id AND organization_id=NEW.organization_id)
    OR btrim(NEW.service_terms)='' OR length(NEW.service_terms)>20000 OR coalesce(NEW.customer_email,'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    THEN RAISE EXCEPTION 'Customer, valid email and service rates/terms are required'; END IF;
  END IF;
  IF NOT private.service_approval_ready(NEW) THEN
   IF NEW.work_order_id IS NOT NULL OR NEW.status IN ('scheduled','in_progress','closed') THEN RAISE EXCEPTION 'Customer acceptance and payment method, or a manager override, are required before scheduling'; END IF;
   IF NEW.status NOT IN ('cancelled','needs_more_info') THEN NEW.status:='pending_customer'; END IF;
  ELSIF NEW.status='pending_customer' THEN NEW.status:='open'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_service_approval() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zz_guard_service_approval BEFORE INSERT OR UPDATE ON public.service_requests FOR EACH ROW EXECUTE FUNCTION private.guard_service_approval();

CREATE OR REPLACE FUNCTION private.audit_service_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE kind text;
BEGIN
 IF TG_OP='INSERT' THEN IF NEW.service_approval_required THEN kind:='required'; END IF;
 ELSIF NEW.service_approval_version IS DISTINCT FROM OLD.service_approval_version THEN kind:='revised';
 ELSIF NEW.service_waived_at IS DISTINCT FROM OLD.service_waived_at THEN kind:='waived';
 ELSIF NEW.service_accepted_at IS DISTINCT FROM OLD.service_accepted_at THEN kind:='accepted';
 ELSIF NEW.service_payment_method_id IS DISTINCT FROM OLD.service_payment_method_id THEN kind:='payment_verified'; END IF;
 IF kind IS NOT NULL THEN
  INSERT INTO public.service_approval_events(request_id,organization_id,event_type,actor_id,actor_name,reason,terms,version)
  VALUES(NEW.id,NEW.organization_id,kind,auth.uid(),CASE WHEN kind='accepted' THEN NEW.service_accepted_by ELSE (SELECT full_name FROM public.profiles WHERE id=auth.uid()) END,NEW.service_waiver_reason,NEW.service_terms,NEW.service_approval_version);
 END IF;
 IF TG_OP='UPDATE' AND OLD.status='pending_customer' AND NEW.status='open' THEN
  INSERT INTO public.notifications(user_id,organization_id,type,title,body,related_id)
  SELECT id,NEW.organization_id,'system','Service request ready to schedule',NEW.customer_name||' — customer requirements completed or waived.',NEW.id
  FROM public.profiles WHERE organization_id=NEW.organization_id AND is_active AND role IN ('admin','service_manager');
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.audit_service_approval() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER audit_service_approval AFTER INSERT OR UPDATE ON public.service_requests FOR EACH ROW EXECUTE FUNCTION private.audit_service_approval();

CREATE OR REPLACE FUNCTION private.staff_service_approval(p_action text,p_id uuid,p_reason text,p_delivery_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.service_requests; actor public.profiles; attempt private.service_approval_invitations;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=auth.uid() AND is_active AND role<>'portal';
 IF actor.id IS NULL THEN RAISE EXCEPTION 'Active staff access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.service_requests WHERE id=p_id AND organization_id=actor.organization_id FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Service request not found' USING ERRCODE='42501'; END IF;
 IF p_action='get' THEN RETURN to_jsonb(r); END IF;
 IF NOT r.service_approval_required OR r.status IN ('cancelled','closed','scheduled','in_progress') OR r.work_order_id IS NOT NULL THEN RAISE EXCEPTION 'This request is no longer awaiting approval'; END IF;
 IF p_action='waive' THEN
  IF actor.role NOT IN ('admin','service_manager') THEN RAISE EXCEPTION 'Only a Service Manager or Admin can override' USING ERRCODE='42501'; END IF;
  IF nullif(btrim(p_reason),'') IS NULL OR length(p_reason)>1000 THEN RAISE EXCEPTION 'Enter a short override reason'; END IF;
  IF r.service_waived_at IS NOT NULL THEN RETURN to_jsonb(r); END IF;
  PERFORM set_config('mjv.service_approval','true',true);
  UPDATE public.service_requests SET service_waived_at=now(),service_waived_by=actor.id,service_waiver_reason=btrim(p_reason),status='open',updated_at=now() WHERE id=r.id RETURNING * INTO r;
  PERFORM set_config('mjv.service_approval','false',true);
  RETURN to_jsonb(r);
 ELSIF p_action='prepare' THEN
  IF p_delivery_id IS NULL OR private.service_approval_ready(r) THEN RAISE EXCEPTION 'No outstanding customer requirements'; END IF;
  SELECT * INTO attempt FROM private.service_approval_invitations WHERE id=p_delivery_id;
  IF FOUND THEN
   IF attempt.request_id<>r.id OR attempt.version<>r.service_approval_version OR attempt.expires_at<=now() THEN RAISE EXCEPTION 'Start a new invitation'; END IF;
  ELSE
   INSERT INTO private.service_approval_invitations(id,request_id,organization_id,version) VALUES(p_delivery_id,r.id,r.organization_id,r.service_approval_version) RETURNING * INTO attempt;
  END IF;
  RETURN to_jsonb(attempt)||jsonb_build_object('recipient',r.customer_email,'customer_name',r.customer_name,'terms',r.service_terms,'description',r.job_description);
 END IF;
 RAISE EXCEPTION 'Invalid action';
END $$;
REVOKE ALL ON FUNCTION private.staff_service_approval(text,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.staff_service_approval(text,uuid,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.staff_service_approval(p_action text,p_id uuid,p_reason text DEFAULT NULL,p_delivery_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.staff_service_approval(p_action,p_id,p_reason,p_delivery_id) $$;
REVOKE ALL ON FUNCTION public.staff_service_approval(text,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_service_approval(text,uuid,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.portal_service_approval(p_action text,p_id uuid,p_token text,p_version uuid,p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.service_requests; invitation private.service_approval_invitations; method public.security_payment_methods;
BEGIN
 -- Every action rechecks the invitation and current version under the request lock.
 SELECT * INTO r FROM public.service_requests WHERE id=p_id FOR UPDATE;
 IF r.id IS NULL OR NOT r.service_approval_required THEN RAISE EXCEPTION 'Service request is unavailable'; END IF;
 SELECT * INTO invitation FROM private.service_approval_invitations WHERE request_id=r.id AND token=p_token AND version=r.service_approval_version AND expires_at>now();
 IF invitation.id IS NULL THEN RAISE EXCEPTION 'This link has expired or was replaced. Contact your service provider.' USING ERRCODE='42501'; END IF;
 IF p_action='accept' THEN
  IF r.service_waived_at IS NOT NULL OR r.status IN ('cancelled','closed','scheduled','in_progress') THEN RAISE EXCEPTION 'This request no longer needs customer action'; END IF;
  IF p_version IS DISTINCT FROM r.service_approval_version OR nullif(btrim(p_name),'') IS NULL OR length(p_name)>200 THEN RAISE EXCEPTION 'Review the current terms and enter your name'; END IF;
  IF r.service_accepted_at IS NULL THEN
   PERFORM set_config('mjv.service_approval','true',true);
   UPDATE public.service_requests SET service_accepted_at=now(),service_accepted_by=btrim(p_name),updated_at=now() WHERE id=r.id RETURNING * INTO r;
   PERFORM set_config('mjv.service_approval','false',true);
  END IF;
 ELSIF p_action<>'get' THEN RAISE EXCEPTION 'Invalid action'; END IF;
 SELECT * INTO method FROM public.security_payment_methods WHERE id=r.service_payment_method_id;
 RETURN jsonb_build_object('id',r.id,'customer_name',r.customer_name,'description',r.job_description,'terms',r.service_terms,
  'version',r.service_approval_version,'accepted_at',r.service_accepted_at,'accepted_by',r.service_accepted_by,
  'payment_method_id',r.service_payment_method_id,'payment_display',concat_ws(' ',method.display_brand,method.display_last4),
  'waived',r.service_waived_at IS NOT NULL,'closed',r.status IN ('cancelled','closed','scheduled','in_progress'),
  'ready',private.service_approval_ready(r));
END $$;
REVOKE ALL ON FUNCTION private.portal_service_approval(text,uuid,text,uuid,text) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon,authenticated;
GRANT EXECUTE ON FUNCTION private.portal_service_approval(text,uuid,text,uuid,text) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.portal_service_approval(p_action text,p_id uuid,p_token text,p_version uuid DEFAULT NULL,p_name text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.portal_service_approval(p_action,p_id,p_token,p_version,p_name) $$;
REVOKE ALL ON FUNCTION public.portal_service_approval(text,uuid,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_service_approval(text,uuid,text,uuid,text) TO anon,authenticated;

-- Only the payment edge function can attach a processor-verified method.
CREATE OR REPLACE FUNCTION private.complete_service_payment_method(p_id uuid,p_token text,p_version uuid,p_method_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.service_requests;
BEGIN
 SELECT * INTO r FROM public.service_requests WHERE id=p_id FOR UPDATE;
 IF r.id IS NULL OR p_version IS DISTINCT FROM r.service_approval_version OR r.service_waived_at IS NOT NULL OR r.status NOT IN ('pending_customer','open')
 OR NOT EXISTS(SELECT 1 FROM private.service_approval_invitations WHERE request_id=r.id AND token=p_token AND version=r.service_approval_version AND expires_at>now())
 OR NOT EXISTS(SELECT 1 FROM public.security_payment_methods m WHERE m.id=p_method_id AND m.contact_id=r.contact_id AND m.organization_id=r.organization_id AND m.is_active AND m.verified_at>now()-interval '5 minutes'
  AND (m.payment_type='ach' OR m.exp_year*12+m.exp_month>=extract(year FROM current_date)::int*12+extract(month FROM current_date)::int))
 THEN RAISE EXCEPTION 'Payment method or service request is no longer eligible'; END IF;
 PERFORM set_config('mjv.service_approval','true',true);
 UPDATE public.service_requests SET service_payment_method_id=p_method_id,updated_at=now() WHERE id=r.id;
 PERFORM set_config('mjv.service_approval','false',true);
END $$;
REVOKE ALL ON FUNCTION private.complete_service_payment_method(uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT EXECUTE ON FUNCTION private.complete_service_payment_method(uuid,text,uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.complete_service_payment_method(p_id uuid,p_token text,p_version uuid,p_method_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.complete_service_payment_method(p_id,p_token,p_version,p_method_id) $$;
REVOKE ALL ON FUNCTION public.complete_service_payment_method(uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_service_payment_method(uuid,text,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION private.mark_service_approval_email_sent(p_id uuid,p_provider_id text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 UPDATE private.service_approval_invitations SET sent_at=coalesce(sent_at,now()),provider_id=coalesce(provider_id,p_provider_id) WHERE id=p_id;
$$;
REVOKE ALL ON FUNCTION private.mark_service_approval_email_sent(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.mark_service_approval_email_sent(uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.mark_service_approval_email_sent(p_id uuid,p_provider_id text)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.mark_service_approval_email_sent(p_id,p_provider_id) $$;
REVOKE ALL ON FUNCTION public.mark_service_approval_email_sent(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_service_approval_email_sent(uuid,text) TO service_role;
