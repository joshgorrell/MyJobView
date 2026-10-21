-- Booked Sales Order credit posting. Preserve attribution at the booking event.
-- Do not credit drafts/planning or cancelled/voided orders.
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
  IF lower(COALESCE(NEW.status,'')) IN ('planning','pending','pending_deposit','cancelled','voided') THEN
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

  v_rep := NEW.sales_rep_id;
  v_booked := COALESCE(NEW.booked_at, NEW.created_at, now());

  -- Initial booking only. Corrections/reversals are intentionally handled by
  -- the later adjustment engine, not by mutating the original credited event.
  INSERT INTO public.sales_performance_credits (
    organization_id, credited_rep_id, customer_id, source_type,
    source_id, source_event_key, effective_at, net_amount, attribution_reason
  )
  VALUES (
    v_org, v_rep, NEW.contact_id, 'sales_order',
    NEW.id, 'sales_order:booked:' || NEW.id::text, v_booked,
    COALESCE(NEW.contract_total,0), 'sales_order_rep_at_booking'
  )
  ON CONFLICT (organization_id, source_event_key) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_booked_sales_order_credit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS capture_booked_sales_order_credit ON public.sales_orders;
CREATE TRIGGER capture_booked_sales_order_credit
AFTER INSERT OR UPDATE OF status ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.capture_booked_sales_order_credit();

-- No automatic historical backfill: old records require status/date audit.
-- No invoice posting until source_type, contact ownership, and linkage verified.
