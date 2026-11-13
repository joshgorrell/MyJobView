-- Serialize invoice writes per Sales Order and enforce the approved
-- contract ceiling across ALL active invoices, not just individual rows.
-- No client-side bypass; paid invoices continue counting toward the cap.
CREATE OR REPLACE FUNCTION public.guard_sales_order_invoice_contract_cap()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_so public.sales_orders%ROWTYPE;
  v_proposal_total numeric;
  v_co_total numeric;
  v_other_invoiced numeric;
  v_limit numeric;
BEGIN
  IF NEW.sales_order_id IS NULL OR NEW.status = 'void' THEN RETURN NEW; END IF;
  IF NEW.total IS NULL OR NEW.total < 0 THEN
    -- Negative credit memos reduce invoiced balance, and are allowed.
    IF NEW.invoice_type = 'credit_memo' AND NEW.total < 0 THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Invoice total must be nonnegative';
  END IF;
  SELECT * INTO v_so FROM public.sales_orders WHERE id = NEW.sales_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales Order not found'; END IF;

  SELECT p.total INTO v_proposal_total FROM public.proposals p WHERE p.id = v_so.proposal_id;
  IF v_proposal_total IS NULL THEN
    v_proposal_total := COALESCE(v_so.original_contract_total, v_so.contract_total);
  END IF;
  IF v_proposal_total IS NULL THEN
    RAISE EXCEPTION 'Approved contract total unavailable; invoice cannot be created';
  END IF;

  SELECT COALESCE(SUM(
    CASE WHEN co.change_amount < 0
      THEN co.change_amount - ABS(COALESCE(co.tax_amount,0))
      ELSE ABS(COALESCE(co.change_amount,0)) + COALESCE(co.tax_amount,0)
    END
  ),0) INTO v_co_total
  FROM public.change_orders co
  WHERE co.sales_order_id = NEW.sales_order_id
    AND co.status = 'approved' AND co.is_billable IS DISTINCT FROM false;

  v_limit := ROUND(v_proposal_total + v_co_total, 2);
  SELECT COALESCE(SUM(i.total),0) INTO v_other_invoiced
  FROM public.invoices i
  WHERE i.sales_order_id = NEW.sales_order_id
    AND i.status IS DISTINCT FROM 'void'
    AND (TG_OP = 'INSERT' OR i.id <> NEW.id);

  IF ROUND(v_other_invoiced + NEW.total,2) > v_limit + 0.005 THEN
    RAISE EXCEPTION 'Invoice exceeds approved Sales Order contract: invoiced %, requested %, contract %',
      v_other_invoiced, NEW.total, v_limit USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sales_order_invoice_contract_cap ON public.invoices;
CREATE TRIGGER trg_guard_sales_order_invoice_contract_cap
BEFORE INSERT OR UPDATE OF total, status, sales_order_id ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.guard_sales_order_invoice_contract_cap();

-- Lock down moving existing invoice allocations to a different invoice or
-- row; corrections should be handled through voiding/rebilling instead.
CREATE OR REPLACE FUNCTION public.guard_so_billing_allocation_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.billing_row_id IS DISTINCT FROM OLD.billing_row_id
    OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
    OR NEW.amount IS DISTINCT FROM OLD.amount THEN
    RAISE EXCEPTION 'Billing allocation history is immutable; void and rebill';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_so_billing_allocation_immutable ON public.sales_order_billing_row_allocations;
CREATE TRIGGER trg_so_billing_allocation_immutable
BEFORE UPDATE ON public.sales_order_billing_row_allocations
FOR EACH ROW EXECUTE FUNCTION public.guard_so_billing_allocation_immutable();
