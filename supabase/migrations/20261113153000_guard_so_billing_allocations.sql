-- Prevent concurrent invoice allocations from billing the same schedule row twice.
-- All allocations for a row serialize on the row lock, regardless of client.
CREATE OR REPLACE FUNCTION public.guard_sales_order_billing_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_row public.sales_order_billing_rows%ROWTYPE;
  v_invoice_so uuid;
  v_status text;
  v_existing numeric;
BEGIN
  SELECT * INTO v_row FROM public.sales_order_billing_rows
  WHERE id = NEW.billing_row_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Billing schedule row does not exist'; END IF;

  SELECT sales_order_id, status INTO v_invoice_so, v_status
  FROM public.invoices WHERE id = NEW.invoice_id;
  IF v_invoice_so IS DISTINCT FROM v_row.sales_order_id THEN
    RAISE EXCEPTION 'Invoice and billing schedule belong to different Sales Orders';
  END IF;
  IF v_status = 'void' THEN
    RAISE EXCEPTION 'Cannot allocate a void invoice';
  END IF;

  SELECT COALESCE(SUM(a.amount),0) INTO v_existing
  FROM public.sales_order_billing_row_allocations a
  JOIN public.invoices i ON i.id = a.invoice_id
  WHERE a.billing_row_id = NEW.billing_row_id
    AND i.status IS DISTINCT FROM 'void'
    AND (TG_OP <> 'UPDATE' OR a.id <> NEW.id);
  IF v_existing + NEW.amount > v_row.scheduled_amount + 0.005 THEN
    RAISE EXCEPTION 'Billing row allocation exceeds scheduled amount';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_sales_order_billing_allocation ON public.sales_order_billing_row_allocations;
CREATE TRIGGER trg_guard_sales_order_billing_allocation
BEFORE INSERT OR UPDATE ON public.sales_order_billing_row_allocations
FOR EACH ROW EXECUTE FUNCTION public.guard_sales_order_billing_allocation();

-- A schedule cannot be reduced below the amount already invoiced.
CREATE OR REPLACE FUNCTION public.guard_sales_order_billing_row_edit()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_billed numeric;
BEGIN
  IF NEW.sales_order_id IS DISTINCT FROM OLD.sales_order_id THEN
    RAISE EXCEPTION 'Cannot move a billing row to another Sales Order';
  END IF;
  SELECT COALESCE(SUM(a.amount),0) INTO v_billed
  FROM public.sales_order_billing_row_allocations a
  JOIN public.invoices i ON i.id = a.invoice_id
  WHERE a.billing_row_id = NEW.id AND i.status IS DISTINCT FROM 'void';
  IF NEW.scheduled_amount + 0.005 < v_billed THEN
    RAISE EXCEPTION 'Scheduled amount cannot be less than already invoiced amount';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_sales_order_billing_row_edit ON public.sales_order_billing_rows;
CREATE TRIGGER trg_guard_sales_order_billing_row_edit
BEFORE UPDATE ON public.sales_order_billing_rows
FOR EACH ROW EXECUTE FUNCTION public.guard_sales_order_billing_row_edit();
