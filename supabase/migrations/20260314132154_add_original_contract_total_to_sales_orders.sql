/*
  # Add original_contract_total to sales_orders

  ## Summary
  Adds a snapshot of the original contract total (from the approved proposal) to sales_orders
  so the billing tab can always show the original amount separately from change order amounts.

  ## Changes
  - `sales_orders.original_contract_total` — set once at creation, never updated by CO approvals

  ## Notes
  - Backfills from the first change order's `original_contract_amount` if available
  - Falls back to current `contract_total` for orders with no change orders
*/

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS original_contract_total numeric DEFAULT 0;

UPDATE sales_orders so
SET original_contract_total = COALESCE(
  (
    SELECT co.original_contract_amount
    FROM change_orders co
    WHERE co.sales_order_id = so.id
    ORDER BY co.created_at ASC
    LIMIT 1
  ),
  so.contract_total,
  0
)
WHERE original_contract_total IS NULL OR original_contract_total = 0;

CREATE OR REPLACE FUNCTION set_so_original_contract_total()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.original_contract_total IS NULL OR NEW.original_contract_total = 0 THEN
    NEW.original_contract_total := COALESCE(NEW.contract_total, 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_so_original_contract_total ON sales_orders;
CREATE TRIGGER trg_set_so_original_contract_total
  BEFORE INSERT ON sales_orders
  FOR EACH ROW EXECUTE FUNCTION set_so_original_contract_total();
