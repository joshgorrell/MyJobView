-- Booked Sales Order credit posting. Preserve attribution at the booking event.
-- Customer commitment is a sale even when deposit, PO or installation is pending.
-- Payment receipt never controls sales-credit timing.
CREATE OR REPLACE FUNCTION public.capture_booked_sales_order_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_rep uuid;
  v_booked timestamptz;
BEGIN
  IF lower(COALESCE(NEW.status,'')) NOT IN ('pending_deposit','pending_po','planning','active','complete','closed')
     OR (TG_OP='UPDATE' AND lower(COALESCE(OLD.status,'')) IN ('pending_deposit','pending_po','planning','active','complete','closed'))
     OR NEW.proposal_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Organization ID was added after initial sales_orders schema.
  v_org := NULLIF(to_jsonb(NEW)->>'organization_id','')::uuid;
  IF v_org IS NULL THEN
    SELECT organization_id INTO v_org FROM public.profiles WHERE id = NEW.created_by;
  END IF;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Sales Order credit requires an organization';
  END IF;

  -- Credit the customer portfolio owner at booking, not necessarily the
  -- employee who created the order. Validate tenant and sales designation.
  SELECT c.assigned_to INTO v_rep FROM public.contacts c
    WHERE c.id=NEW.contact_id AND c.organization_id=v_org;
  IF v_rep IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=v_rep
      AND p.organization_id=v_org AND p.is_sales_rep=true
  ) THEN v_rep:=NULL; END IF;
  -- A linked approved proposal provides the commitment signal. An unlinked
  -- manually entered planning order is not automatically treated as sold.
  IF NOT EXISTS (SELECT 1 FROM public.proposals p WHERE p.id=NEW.proposal_id
                 AND lower(COALESCE(p.status,'')) IN ('approved','accepted')) THEN
    RETURN NEW;
  END IF;
  v_booked := COALESCE(NEW.booked_at, now());

  -- Initial booking only. Corrections/reversals are intentionally handled by
  -- the later adjustment engine, not by mutating the original credited event.
  INSERT INTO public.sales_performance_credits (
    organization_id, credited_rep_id, customer_id, source_type,
    source_id, source_event_key, effective_at, net_amount, attribution_reason
  )
  VALUES (
    v_org, v_rep, NEW.contact_id, 'sales_order',
    NEW.id, 'sales_order:booked:' || NEW.id::text, v_booked,
    COALESCE(NEW.contract_total,0), CASE WHEN v_rep IS NULL THEN 'customer_unassigned_at_booking' ELSE 'customer_owner_at_booking' END
  )
  ON CONFLICT (organization_id, source_event_key) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_booked_sales_order_credit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS capture_booked_sales_order_credit ON public.sales_orders;
CREATE TRIGGER capture_booked_sales_order_credit
AFTER INSERT OR UPDATE OF status, proposal_id ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.capture_booked_sales_order_credit();

-- No automatic historical backfill: old records require status/date audit.
-- No invoice posting until source_type, contact ownership, and linkage verified.
