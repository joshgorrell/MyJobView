-- VIP keeps the familiar add-items / select / request-service workflow.
BEGIN;
-- Missing portal claims must produce false, never SQL NULL in authorization guards.
CREATE OR REPLACE FUNCTION private.punchlist_portal_identity(p_contact uuid,p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(auth.uid() IS NOT NULL AND (
  (coalesce((auth.jwt()->'app_metadata'->>'is_portal_user')::boolean,false)
   AND auth.jwt()->'app_metadata'->>'contact_id'=p_contact::text
   AND auth.jwt()->'app_metadata'->>'organization_id'=p_org::text)
  OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active
   AND p.role IN ('portal_user','customer','portal','client') AND p.contact_id=p_contact AND p.organization_id=p_org)
 ),false);
$$;
REVOKE ALL ON FUNCTION private.punchlist_portal_identity(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.punchlist_portal_identity(uuid,uuid) TO authenticated;
ALTER TABLE public.quickbooks_settings ADD COLUMN IF NOT EXISTS vip_membership_item_id text;
CREATE TABLE public.portal_service_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),
 contact_id uuid NOT NULL REFERENCES public.contacts(id),description text NOT NULL CHECK(length(btrim(description)) BETWEEN 1 AND 10000),
 service_request_id uuid REFERENCES public.service_requests(id),sort_order int NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX portal_service_items_customer ON public.portal_service_items(organization_id,contact_id,sort_order);
CREATE INDEX portal_service_items_request ON public.portal_service_items(service_request_id) WHERE service_request_id IS NOT NULL;
ALTER TABLE public.portal_service_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_service_items FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.portal_service_items TO authenticated;
CREATE POLICY service_items_staff_read ON public.portal_service_items FOR SELECT TO authenticated USING(private.punchlist_staff_identity(organization_id));
ALTER TABLE public.portal_support_photos ADD COLUMN service_item_id uuid REFERENCES public.portal_service_items(id);
ALTER TABLE public.portal_support_photos DROP CONSTRAINT portal_support_photos_check;
ALTER TABLE public.portal_support_photos ADD CONSTRAINT support_photo_one_parent CHECK(num_nonnulls(task_id,request_id,service_item_id)=1);
CREATE INDEX portal_support_photos_service_item ON public.portal_support_photos(service_item_id) WHERE service_item_id IS NOT NULL;

ALTER FUNCTION private.support_photo_read(text) RENAME TO project_support_photo_read;
CREATE OR REPLACE FUNCTION private.support_photo_read(p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.project_support_photo_read(p_path) OR EXISTS(SELECT 1 FROM public.portal_support_photos f JOIN public.portal_service_items i ON i.id=f.service_item_id
 WHERE f.storage_path=p_path AND f.organization_id=i.organization_id AND f.contact_id=i.contact_id
 AND (private.punchlist_staff_identity(i.organization_id) OR private.punchlist_portal_identity(i.contact_id,i.organization_id)));
$$;
REVOKE ALL ON FUNCTION private.support_photo_read(text),private.project_support_photo_read(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.support_photo_read(text) TO authenticated;
-- Existing policies bind to the original function OID; replace them with the extended helper.
DROP POLICY support_photos_read ON public.portal_support_photos;
CREATE POLICY support_photos_read ON public.portal_support_photos FOR SELECT TO authenticated USING(private.support_photo_read(storage_path));
DROP POLICY portal_support_read ON storage.objects;
CREATE POLICY portal_support_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='portal-support' AND private.support_photo_read(name));

ALTER FUNCTION public.get_customer_support(uuid) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.get_customer_support(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_customer_support(p_contact_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 result=private.get_customer_support(p_contact_id); -- also verifies caller/contact ownership
 RETURN result||jsonb_build_object('service_address',(SELECT concat_ws(', ',nullif(btrim(c.street_address),''),nullif(btrim(c.city),''),nullif(btrim(c.state),''),nullif(btrim(c.zip_code),'')) FROM public.contacts c WHERE c.id=p_contact_id),'service_items',coalesce((SELECT jsonb_agg(jsonb_build_object(
  'id',i.id,'description',i.description,'updated_at',i.updated_at,'requested',i.service_request_id IS NOT NULL,
  'status',CASE WHEN s.status='closed' THEN 'completed' WHEN s.status IN ('scheduled','in_progress') THEN s.status WHEN i.service_request_id IS NOT NULL THEN 'requested' ELSE 'draft' END,
  'photos',coalesce((SELECT jsonb_agg(f.storage_path) FROM public.portal_support_photos f WHERE f.service_item_id=i.id),'[]')) ORDER BY i.sort_order,i.created_at,i.id)
 FROM public.portal_service_items i LEFT JOIN public.service_requests s ON s.id=i.service_request_id
 WHERE i.contact_id=p_contact_id AND i.organization_id=(result->>'organization_id')::uuid),'[]'));
END; $$;

CREATE OR REPLACE FUNCTION public.save_vip_service_item(p_contact_id uuid,p_item_id uuid,p_description text,p_photos text[] DEFAULT '{}',p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.contacts; i public.portal_service_items; path text;
BEGIN
 SELECT * INTO c FROM public.contacts WHERE id=p_contact_id FOR UPDATE;
 IF c.id IS NULL OR NOT private.punchlist_portal_identity(c.id,c.organization_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF NOT private.vip_service_entitled(c.id,c.organization_id) THEN RAISE EXCEPTION 'An active paid or complimentary VIP plan is required' USING ERRCODE='42501'; END IF;
 IF p_item_id IS NULL OR nullif(btrim(p_description),'') IS NULL OR length(p_description)>10000 OR coalesce(cardinality(p_photos),0)>10 THEN RAISE EXCEPTION 'Describe the item and use up to 10 photos'; END IF;
 SELECT * INTO i FROM public.portal_service_items WHERE id=p_item_id FOR UPDATE;
 IF FOUND THEN
  IF i.contact_id<>c.id OR i.organization_id<>c.organization_id THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF p_expected_updated_at IS NULL THEN RETURN i.id; END IF; -- idempotent create retry
  IF i.updated_at IS DISTINCT FROM p_expected_updated_at OR i.service_request_id IS NOT NULL THEN RAISE EXCEPTION 'This item changed or was requested. Refresh before editing.'; END IF;
  UPDATE public.portal_service_items SET description=btrim(p_description),updated_at=clock_timestamp() WHERE id=i.id;
 ELSE
  IF p_expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'Item no longer exists'; END IF;
  INSERT INTO public.portal_service_items(id,organization_id,contact_id,description,sort_order) VALUES(p_item_id,c.organization_id,c.id,btrim(p_description),coalesce((SELECT max(sort_order)+1 FROM public.portal_service_items WHERE contact_id=c.id),0));
 END IF;
 FOREACH path IN ARRAY coalesce(p_photos,ARRAY[]::text[]) LOOP
  IF path NOT LIKE c.organization_id::text||'/'||c.id::text||'/%' OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='portal-support' AND name=path) THEN RAISE EXCEPTION 'Invalid photo'; END IF;
  INSERT INTO public.portal_support_photos(organization_id,contact_id,service_item_id,storage_path) VALUES(c.organization_id,c.id,p_item_id,path);
 END LOOP;
 RETURN p_item_id;
END; $$;
CREATE OR REPLACE FUNCTION public.delete_vip_service_item(p_item_id uuid,p_expected_updated_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i public.portal_service_items;
BEGIN
 SELECT * INTO i FROM public.portal_service_items WHERE id=p_item_id;
 IF i.id IS NULL OR NOT private.punchlist_portal_identity(i.contact_id,i.organization_id) OR NOT private.vip_service_entitled(i.contact_id,i.organization_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.contacts WHERE id=i.contact_id FOR UPDATE;
 SELECT * INTO i FROM public.portal_service_items WHERE id=p_item_id FOR UPDATE;
 IF i.id IS NULL OR i.service_request_id IS NOT NULL OR i.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'This item changed or was requested. Refresh before removing it.'; END IF;
 DELETE FROM public.portal_support_photos WHERE service_item_id=i.id;
 DELETE FROM public.portal_service_items WHERE id=i.id;
END; $$;
CREATE OR REPLACE FUNCTION public.request_vip_service_visit(p_contact_id uuid,p_item_ids uuid[],p_address text,p_submission_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.contacts; ids uuid[]; result uuid; description text;
BEGIN
 SELECT * INTO c FROM public.contacts WHERE id=p_contact_id FOR UPDATE;
 IF c.id IS NULL OR NOT private.punchlist_portal_identity(c.id,c.organization_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT id INTO result FROM public.service_requests WHERE organization_id=c.organization_id AND contact_id=c.id AND portal_submission_id=p_submission_id;
 IF result IS NOT NULL THEN RETURN result; END IF;
 IF NOT private.vip_service_entitled(c.id,c.organization_id) THEN RAISE EXCEPTION 'An active paid or complimentary VIP plan is required' USING ERRCODE='42501'; END IF;
 SELECT array_agg(DISTINCT x) INTO ids FROM unnest(p_item_ids) x WHERE x IS NOT NULL;
 IF p_submission_id IS NULL OR coalesce(cardinality(ids),0)=0 OR nullif(btrim(p_address),'') IS NULL OR length(p_address)>1000 THEN RAISE EXCEPTION 'Select items and enter the service address'; END IF;
 IF (SELECT count(*) FROM public.portal_service_items WHERE id=ANY(ids) AND contact_id=c.id AND organization_id=c.organization_id AND service_request_id IS NULL)<>cardinality(ids) THEN RAISE EXCEPTION 'An item was changed or already requested. Refresh your list.'; END IF;
 SELECT string_agg('- '||i.description,E'\n' ORDER BY i.sort_order,i.created_at,i.id) INTO description FROM public.portal_service_items i WHERE id=ANY(ids);
 INSERT INTO public.service_requests(organization_id,contact_id,customer_name,customer_phone,customer_email,job_location_address,job_description,billable_type,billable_by,priority,status,source_type,request_type,portal_submission_id)
 VALUES(c.organization_id,c.id,coalesce(c.full_name,c.company_name,'Customer'),c.phone,c.email,btrim(p_address),description,'billable','admin','normal','open','customer_portal','service',p_submission_id) RETURNING id INTO result;
 UPDATE public.portal_service_items SET service_request_id=result,updated_at=clock_timestamp() WHERE id=ANY(ids);
 RETURN result;
END; $$;
CREATE OR REPLACE FUNCTION private.release_cancelled_vip_items()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN UPDATE public.portal_service_items SET service_request_id=NULL,updated_at=clock_timestamp() WHERE service_request_id=NEW.id; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.release_cancelled_vip_items() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER release_cancelled_vip_items AFTER UPDATE OF status ON public.service_requests FOR EACH ROW EXECUTE FUNCTION private.release_cancelled_vip_items();
REVOKE ALL ON FUNCTION public.get_customer_support(uuid),public.save_vip_service_item(uuid,uuid,text,text[],timestamptz),public.delete_vip_service_item(uuid,timestamptz),public.request_vip_service_visit(uuid,uuid[],text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_customer_support(uuid),public.save_vip_service_item(uuid,uuid,text,text[],timestamptz),public.delete_vip_service_item(uuid,timestamptz),public.request_vip_service_visit(uuid,uuid[],text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_service_request_photo_paths(p_request_id uuid)
RETURNS SETOF text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.service_requests;
BEGIN
 SELECT * INTO r FROM public.service_requests WHERE id=p_request_id;
 IF r.id IS NULL OR NOT (private.punchlist_staff_identity(r.organization_id) OR private.punchlist_portal_identity(r.contact_id,r.organization_id)) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT f.storage_path FROM public.portal_support_photos f LEFT JOIN public.portal_service_items i ON i.id=f.service_item_id
 WHERE f.organization_id=r.organization_id AND f.contact_id=r.contact_id AND (f.request_id=r.id OR i.service_request_id=r.id);
END; $$;
REVOKE ALL ON FUNCTION public.get_service_request_photo_paths(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_service_request_photo_paths(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_work_order_support_photo_paths(p_work_order_id uuid)
RETURNS SETOF text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w public.work_orders;
BEGIN
 SELECT * INTO w FROM public.work_orders WHERE id=p_work_order_id;
 IF w.id IS NULL OR NOT private.punchlist_staff_identity(w.organization_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT DISTINCT f.storage_path FROM public.service_requests r
 JOIN public.work_orders primary_order ON primary_order.id=r.work_order_id AND primary_order.organization_id=w.organization_id AND primary_order.contact_id=w.contact_id
 LEFT JOIN public.portal_service_items i ON i.service_request_id=r.id AND i.organization_id=w.organization_id AND i.contact_id=w.contact_id
 JOIN public.portal_support_photos f ON (f.request_id=r.id OR f.service_item_id=i.id) AND f.organization_id=w.organization_id AND f.contact_id=w.contact_id
 WHERE r.organization_id=w.organization_id AND r.contact_id=w.contact_id
 AND (primary_order.id=w.id OR (w.creation_request_id IS NOT NULL AND primary_order.creation_request_id=w.creation_request_id));
END; $$;
REVOKE ALL ON FUNCTION public.get_work_order_support_photo_paths(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_work_order_support_photo_paths(uuid) TO authenticated;
-- Portal profile changes must never change server pricing or remote accounting identity.
CREATE OR REPLACE FUNCTION private.protect_portal_billing_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF current_user='authenticated' AND NOT private.punchlist_staff_identity(OLD.organization_id) AND (NEW.tax_rate IS DISTINCT FROM OLD.tax_rate OR NEW.is_tax_exempt IS DISTINCT FROM OLD.is_tax_exempt OR NEW.qbo_customer_id IS DISTINCT FROM OLD.qbo_customer_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN RAISE EXCEPTION 'Billing identity is managed by your provider' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.protect_portal_billing_identity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER protect_portal_billing_identity BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION private.protect_portal_billing_identity();
ALTER TABLE public.subscription_payments DROP CONSTRAINT IF EXISTS subscription_payments_payment_type_check;
ALTER TABLE public.subscription_payments ADD CONSTRAINT subscription_payments_payment_type_check CHECK(payment_type IN ('card','ach','hosted_invoice'));
-- Server-priced checkout snapshots; customers cannot self-activate or choose amounts.
CREATE TABLE public.vip_membership_checkouts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),contact_id uuid NOT NULL REFERENCES public.contacts(id),
 subscription_id uuid NOT NULL UNIQUE REFERENCES public.recurring_subscriptions(id),plan_id uuid NOT NULL REFERENCES public.recurring_plans(id),
 plan_name text NOT NULL,billing_frequency text NOT NULL,subtotal numeric(10,2) NOT NULL CHECK(subtotal>0),tax_amount numeric(10,2) NOT NULL CHECK(tax_amount>=0),total numeric(10,2) NOT NULL CHECK(total>0),
 qbo_invoice_id text,qbo_customer_id text,qbo_realm_id text,qbo_environment text,payment_url text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','cancelled')),created_at timestamptz NOT NULL DEFAULT now(),paid_at timestamptz
);
CREATE UNIQUE INDEX vip_checkout_remote_invoice ON public.vip_membership_checkouts(organization_id,qbo_environment,qbo_realm_id,qbo_invoice_id) WHERE qbo_invoice_id IS NOT NULL;
ALTER TABLE public.vip_membership_checkouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vip_membership_checkouts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.vip_membership_checkouts TO authenticated;
CREATE POLICY vip_checkout_owner_read ON public.vip_membership_checkouts FOR SELECT TO authenticated USING(private.punchlist_staff_identity(organization_id) OR private.punchlist_portal_identity(contact_id,organization_id));
GRANT ALL ON public.vip_membership_checkouts,public.portal_service_items TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_vip_checkout(p_contact_id uuid,p_plan_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.contacts; p public.recurring_plans; s uuid; checkout public.vip_membership_checkouts; tax numeric;
BEGIN
 SELECT * INTO c FROM public.contacts WHERE id=p_contact_id FOR UPDATE;
 IF c.id IS NULL OR NOT private.punchlist_portal_identity(c.id,c.organization_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.recurring_plans WHERE id=p_plan_id AND organization_id=c.organization_id AND plan_type='vip_plan' AND is_active AND show_on_portal;
 IF p.id IS NULL OR p.amount<=0 THEN RAISE EXCEPTION 'Choose a paid VIP plan'; END IF;
 IF EXISTS(SELECT 1 FROM public.vip_membership_checkouts x WHERE x.contact_id=c.id AND x.organization_id=c.organization_id AND x.status='pending' AND x.plan_id<>p.id) THEN RAISE EXCEPTION 'You have an unfinished checkout for another VIP plan. Resume that plan or contact your representative to change it.'; END IF;
 IF NOT private.vip_service_entitled(c.id,c.organization_id) AND EXISTS(SELECT 1 FROM public.recurring_subscriptions old JOIN public.recurring_plans op ON op.id=old.plan_id WHERE old.contact_id=c.id AND old.organization_id=c.organization_id AND old.status='active' AND op.plan_type='vip_plan' AND (old.end_date IS NULL OR old.end_date>=CURRENT_DATE)) THEN RAISE EXCEPTION 'Your existing VIP billing needs review. Please contact your representative to renew.'; END IF;
 s=public.request_vip_membership(c.id,p.id);
 SELECT * INTO checkout FROM public.vip_membership_checkouts WHERE subscription_id=s;
 IF NOT FOUND THEN
  -- Same configured contact tax treatment used by recurring invoices; prices are server-owned.
  tax=CASE WHEN coalesce(c.is_tax_exempt,false) THEN 0 ELSE round(p.amount*coalesce(c.tax_rate,0)/100,2) END;
  INSERT INTO public.vip_membership_checkouts(organization_id,contact_id,subscription_id,plan_id,plan_name,billing_frequency,subtotal,tax_amount,total)
  VALUES(c.organization_id,c.id,s,p.id,p.plan_name,p.billing_frequency,p.amount,tax,p.amount+tax) RETURNING * INTO checkout;
 END IF;
 RETURN jsonb_build_object('id',checkout.id,'subscription_id',s,'plan_name',checkout.plan_name,'total',checkout.total,'billing_frequency',checkout.billing_frequency,'status',checkout.status);
END; $$;
REVOKE ALL ON FUNCTION public.prepare_vip_checkout(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.prepare_vip_checkout(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_vip_checkout_payment(p_checkout_id uuid,p_qbo_invoice_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE checkout public.vip_membership_checkouts; subscription public.recurring_subscriptions; period interval;
BEGIN
 SELECT * INTO checkout FROM public.vip_membership_checkouts WHERE id=p_checkout_id FOR UPDATE;
 IF checkout.id IS NULL OR checkout.qbo_invoice_id IS DISTINCT FROM p_qbo_invoice_id THEN RAISE EXCEPTION 'Checkout invoice mismatch'; END IF;
 IF checkout.status='paid' THEN RETURN true; END IF;
 IF checkout.status<>'pending' THEN RETURN false; END IF;
 SELECT * INTO subscription FROM public.recurring_subscriptions WHERE id=checkout.subscription_id AND organization_id=checkout.organization_id AND contact_id=checkout.contact_id FOR UPDATE;
 IF subscription.id IS NULL OR subscription.status<>'pending_payment' OR subscription.is_complimentary OR subscription.plan_id IS DISTINCT FROM checkout.plan_id THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.recurring_subscriptions s JOIN public.recurring_plans p ON p.id=s.plan_id WHERE s.contact_id=checkout.contact_id AND s.organization_id=checkout.organization_id AND s.id<>subscription.id AND s.status='active' AND p.plan_type='vip_plan' AND (s.end_date IS NULL OR s.end_date>=CURRENT_DATE)) THEN RETURN false; END IF;
 period=CASE checkout.billing_frequency WHEN 'daily' THEN interval '1 day' WHEN 'weekly' THEN interval '1 week' WHEN 'monthly' THEN interval '1 month' WHEN 'quarterly' THEN interval '3 months' WHEN 'yearly' THEN interval '1 year' ELSE NULL END;
 IF period IS NULL THEN RAISE EXCEPTION 'Unsupported billing frequency'; END IF;
 UPDATE public.recurring_subscriptions SET status='active',start_date=CURRENT_DATE,end_date=NULL,next_billing_date=(CURRENT_DATE+period)::date,custom_amount=checkout.subtotal,auto_invoice=true,auto_send=true,auto_renew=true WHERE id=subscription.id;
 INSERT INTO public.subscription_payments(organization_id,contact_id,subscription_id,amount,total_amount,payment_type,status,payment_date,qbo_invoice_id,description)
 VALUES(checkout.organization_id,checkout.contact_id,subscription.id,checkout.subtotal,checkout.total,'hosted_invoice','completed',now(),checkout.qbo_invoice_id,'VIP membership hosted invoice payment');
 UPDATE public.vip_membership_checkouts SET status='paid',paid_at=now() WHERE id=checkout.id;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.confirm_vip_checkout_payment(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_vip_checkout_payment(uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
