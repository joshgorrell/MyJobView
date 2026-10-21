-- Conservative first-pass invoice credit capture.
-- Only standalone submitted invoices without project linkage are eligible.
-- More complex project-linked service and mixed invoices remain excluded pending reconciliation.
CREATE OR REPLACE FUNCTION public.capture_standalone_invoice_sales_credit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rep uuid;
  v_org uuid;
  v_kind text;
  v_source text;
  v_invoice_type text;
BEGIN
  IF NEW.status NOT IN ('submitted','partial','paid','overdue')
     OR NEW.project_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_source := lower(coalesce(to_jsonb(NEW)->>'source_type',''));
  v_invoice_type := lower(coalesce(to_jsonb(NEW)->>'invoice_type',''));
  -- Never treat project/deposit/progress/final billing as incremental sales.
  IF v_source IN ('progress','deposit','final','project','change_order')
     OR v_invoice_type IN ('progress','deposit','final','project','change_order') THEN
    RETURN NEW;
  END IF;

  v_org := NEW.organization_id;
  SELECT c.assigned_to INTO v_rep
  FROM public.contacts c
  WHERE c.id=NEW.contact_id AND c.organization_id=v_org;

  -- If the owner is not an active sales rep in this organization, leave
  -- the event unassigned; never credit the invoice creator.
  IF v_rep IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id=v_rep AND p.organization_id=v_org AND p.is_sales_rep=true
  ) THEN
    v_rep := NULL;
  END IF;

  -- Service work-order linkage can be created before invoice submission.
  -- Only classify standalone invoices; retail is the conservative default.
  v_kind := CASE WHEN NEW.work_order_billing_request_id IS NOT NULL
                    OR EXISTS (SELECT 1 FROM public.work_order_invoice_links l
                               WHERE l.invoice_id=NEW.id AND l.organization_id=v_org)
                 THEN 'service_invoice'
                 ELSE 'retail_invoice' END;

  INSERT INTO public.sales_performance_credits (
    organization_id, credited_rep_id, customer_id, source_type,
    source_id, source_event_key, effective_at, net_amount, attribution_reason
  ) VALUES (
    v_org, v_rep, NEW.contact_id, v_kind,
    NEW.id, 'invoice:posted:'||NEW.id::text,
    (COALESCE(NEW.invoice_date,CURRENT_DATE)::timestamp AT TIME ZONE 'America/Chicago'),
    COALESCE(NEW.subtotal,NEW.total-COALESCE(NEW.tax_amount,0)),
    CASE WHEN v_rep IS NULL THEN 'customer_unassigned_at_posting'
         ELSE 'customer_owner_at_invoice_posting' END
  )
  ON CONFLICT (organization_id,source_event_key) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_standalone_invoice_sales_credit() FROM PUBLIC,anon,authenticated;

-- Enabled only for new invoice submissions; existing historical invoices
-- require reviewed backfill. Later corrections require adjustment events.
DROP TRIGGER IF EXISTS capture_standalone_invoice_sales_credit ON public.invoices;
CREATE TRIGGER capture_standalone_invoice_sales_credit
AFTER INSERT OR UPDATE OF status ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.capture_standalone_invoice_sales_credit();
