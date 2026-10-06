ALTER TABLE public.invoices ADD COLUMN customer_visible_on_submit boolean NOT NULL DEFAULT true;
UPDATE public.invoices SET customer_visible_on_submit=portal_visible WHERE status<>'draft';

CREATE OR REPLACE FUNCTION private.submit_invoice_authorized(p_invoice_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE visible boolean; result jsonb;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' AND (
 auth.uid() IS NULL OR NOT public.can_view_all_org_invoices() OR NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=p_invoice_id AND organization_id=public.get_user_org_id())) THEN RAISE EXCEPTION 'Billing permission required for this organization'; END IF;
 SELECT customer_visible_on_submit INTO visible FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
 result:=private.submit_invoice_engine(p_invoice_id);
 IF coalesce((result->>'success')::boolean,false) AND visible=false THEN
   -- Same transaction: an internal invoice is never exposed to the worker or portal.
   UPDATE public.invoices SET portal_visible=false WHERE id=p_invoice_id;
   DELETE FROM public.invoice_portal_deliveries WHERE invoice_id=p_invoice_id AND status IN ('pending','failed','skipped');
   result:=result || jsonb_build_object('portal_visible',false);
 END IF;
 RETURN result;
END $$;

-- Persist the delivery choice even when saving a draft for later submission.
DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.save_work_order_invoice(uuid,uuid[],jsonb,jsonb,boolean,boolean,uuid)'::regprocedure) INTO definition;
 IF position(' IF p_publish THEN' in definition)=0 THEN RAISE EXCEPTION 'Work-order submission function changed; review visibility integration'; END IF;
 definition:=replace(definition,' IF p_publish THEN',' UPDATE public.invoices SET customer_visible_on_submit=p_portal WHERE id=inv;
 IF p_publish THEN');
 EXECUTE definition;
END $$;
