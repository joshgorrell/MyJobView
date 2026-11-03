ALTER TABLE public.quickbooks_settings ADD COLUMN IF NOT EXISTS service_labor_item_id text;
ALTER TABLE public.quickbooks_settings ADD COLUMN IF NOT EXISTS service_parts_item_id text;
GRANT SELECT(service_labor_item_id,service_parts_item_id) ON public.quickbooks_settings TO authenticated;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS qbo_payment_url text;
CREATE TABLE public.invoice_portal_deliveries (
 invoice_id uuid PRIMARY KEY REFERENCES public.invoices(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','processing','sent','failed','skipped')),
 attempts integer NOT NULL DEFAULT 0,
 revision integer NOT NULL DEFAULT 1,
 available_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 sent_at timestamptz,
 error text,
 email_payload jsonb
);
ALTER TABLE public.invoice_portal_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_delivery_read ON public.invoice_portal_deliveries FOR SELECT TO authenticated USING(organization_id=public.get_user_org_id() AND public.can_view_all_org_invoices());
GRANT SELECT ON public.invoice_portal_deliveries TO authenticated;
GRANT ALL ON public.invoice_portal_deliveries TO service_role;
CREATE FUNCTION private.queue_invoice_portal_delivery() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.portal_visible AND NEW.status NOT IN('draft','void') AND NEW.security_billing_cycle_id IS NULL AND (TG_OP='INSERT' OR OLD.status='draft' OR NOT coalesce(OLD.portal_visible,false)) THEN
  INSERT INTO public.invoice_portal_deliveries(invoice_id,organization_id) VALUES(NEW.id,NEW.organization_id) ON CONFLICT(invoice_id) DO UPDATE SET status='pending',revision=invoice_portal_deliveries.revision+1,attempts=0,available_at=now(),lease_until=null,error=null,email_payload=null,sent_at=null;
 END IF;
 UPDATE public.service_billing_queue SET status=CASE WHEN NEW.status='draft' THEN 'invoice_created' WHEN NEW.status='void' THEN 'closed' WHEN NEW.status='paid' OR NEW.amount_due<=0 THEN 'paid' WHEN NEW.status='overdue' THEN 'overdue' ELSE 'payment_pending' END, invoiced_at=CASE WHEN NEW.status NOT IN('draft','void') THEN coalesce(invoiced_at,now()) ELSE invoiced_at END WHERE invoice_id=NEW.id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.queue_invoice_portal_delivery() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER invoice_portal_delivery AFTER INSERT OR UPDATE OF portal_visible,status,amount_due ON public.invoices FOR EACH ROW EXECUTE FUNCTION private.queue_invoice_portal_delivery();
CREATE FUNCTION public.claim_invoice_portal_deliveries() RETURNS SETOF public.invoice_portal_deliveries LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 UPDATE public.invoice_portal_deliveries SET status='processing',attempts=attempts+1,lease_until=now()+interval '5 minutes'
 WHERE invoice_id IN(SELECT invoice_id FROM public.invoice_portal_deliveries WHERE available_at<=now() AND (status IN('pending','failed') OR (status='processing' AND lease_until<now())) ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 10) RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_invoice_portal_deliveries() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_invoice_portal_deliveries() TO service_role;
-- Reuse the existing dedicated Vault worker credential, never an end-user token.
CREATE FUNCTION private.invoke_invoice_portal_delivery() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE endpoint text; credential text; BEGIN
 SELECT decrypted_secret INTO endpoint FROM vault.decrypted_secrets WHERE name='security_billing_project_url';
 SELECT decrypted_secret INTO credential FROM vault.decrypted_secrets WHERE name='security_billing_worker_secret';
 IF endpoint IS NULL OR endpoint !~ '^https://[a-z0-9]+\.supabase\.co$' OR credential IS NULL THEN RETURN NULL; END IF;
 RETURN net.http_post(url:=endpoint||'/functions/v1/invoice-portal-delivery',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||credential),body:='{}'::jsonb,timeout_milliseconds:=60000);
END $$;
REVOKE ALL ON FUNCTION private.invoke_invoice_portal_delivery() FROM PUBLIC,anon,authenticated,service_role;
SELECT cron.schedule('invoice-portal-delivery-every-minute','* * * * *','select private.invoke_invoice_portal_delivery();');
