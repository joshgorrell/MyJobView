-- Recurring invoices may be generated with status 'sent' before recurring_invoices
-- links exist. Credit them only once the subscription linkage has been recorded.
-- This prevents guessing the originator from the customer's current assignment.
CREATE OR REPLACE FUNCTION public.capture_subscription_invoice_credit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_invoice public.invoices%ROWTYPE; v_sub public.recurring_subscriptions%ROWTYPE;
  v_rep uuid; v_org uuid; v_amount numeric; v_gross numeric; v_prior numeric; v_last uuid;
BEGIN
  SELECT * INTO v_invoice FROM public.invoices WHERE id=NEW.invoice_id;
  SELECT * INTO v_sub FROM public.recurring_subscriptions WHERE id=NEW.subscription_id;
  IF v_invoice.id IS NULL OR v_sub.id IS NULL OR v_invoice.contact_id IS NULL THEN RETURN NEW; END IF;
  v_org:=v_invoice.organization_id;
  IF v_org IS NULL OR v_sub.organization_id IS DISTINCT FROM v_org THEN RETURN NEW; END IF;
  IF v_invoice.status NOT IN ('sent','submitted','partial','paid','overdue') THEN RETURN NEW; END IF;
  IF v_invoice.project_id IS NOT NULL OR lower(coalesce(v_invoice.invoice_type,''))<>'recurring' THEN RETURN NEW; END IF;
  -- The same invoice can contain multiple subscriptions. Do not credit its
  -- full amount multiple times. Each subscription gets its own billed line.
  -- Deferred execution sees all billing links inserted in this transaction.
  SELECT SUM(GREATEST(COALESCE(ri.amount,0),0)), MAX(ri.id)
    INTO v_gross,v_last FROM public.recurring_invoices ri WHERE ri.invoice_id=NEW.invoice_id;
  IF COALESCE(v_gross,0)<=0 THEN RETURN NEW; END IF;
  -- Snapshot the originating salesperson from the subscription creator only
  -- when they are an actual sales rep. Other cases remain unassigned pending
  -- explicit origination mapping.
  SELECT p.id INTO v_rep FROM public.profiles p
    WHERE p.id=v_sub.created_by_user_id AND p.organization_id=v_org AND p.is_sales_rep=true;
  -- Allocate the actual pretax invoice subtotal across subscriptions.
  -- The final link absorbs rounding so all credited rows sum exactly to subtotal.
  SELECT COALESCE(SUM(ROUND(GREATEST(COALESCE(ri.amount,0),0)
             * GREATEST(COALESCE(v_invoice.subtotal,0),0) / v_gross,2)),0)
    INTO v_prior FROM public.recurring_invoices ri
    WHERE ri.invoice_id=NEW.invoice_id AND ri.id<>v_last;
  v_amount:=CASE WHEN NEW.id=v_last THEN
    GREATEST(COALESCE(v_invoice.subtotal,0),0)-v_prior
    ELSE ROUND(GREATEST(COALESCE(NEW.amount,0),0)
      * GREATEST(COALESCE(v_invoice.subtotal,0),0)/v_gross,2) END;
  IF v_amount<=0 THEN RETURN NEW; END IF;
  INSERT INTO public.sales_performance_credits
    (organization_id,credited_rep_id,customer_id,source_type,source_id,source_event_key,effective_at,net_amount,attribution_reason)
  VALUES (v_org,v_rep,v_invoice.contact_id,'recurring_invoice',NEW.invoice_id,
    'subscription_billing:'||NEW.id::text,
    (COALESCE(v_invoice.invoice_date,CURRENT_DATE)::timestamp AT TIME ZONE 'America/Chicago'),
    v_amount,CASE WHEN v_rep IS NULL THEN 'subscription_origin_unverified' ELSE 'subscription_creator_sales_rep' END)
  ON CONFLICT (organization_id,source_event_key) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_subscription_invoice_credit() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS capture_subscription_invoice_credit ON public.recurring_invoices;
CREATE CONSTRAINT TRIGGER capture_subscription_invoice_credit
AFTER INSERT ON public.recurring_invoices
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.capture_subscription_invoice_credit();
