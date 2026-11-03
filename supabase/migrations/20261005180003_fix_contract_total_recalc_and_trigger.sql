/*
# Fix contract_total double-counting and add auto-recalc trigger

## Problem
The `sales_orders.contract_total` column has been corrupted across many orders
because the client-side approval flow set `contract_total = new_contract_total`,
where `new_contract_total = original_contract_amount + change_amount`. The
`original_contract_amount` snapshot on each change order was often stale or
already included prior CO amounts, causing compounding inflation.

Additionally, `original_contract_total` was sometimes set to a running CO total
instead of the immutable proposal total, making it unreliable as a baseline.

## What This Migration Does

### 1. Repairs `original_contract_total`
For every sales order that has a linked proposal, set `original_contract_total`
to the proposal's `total`. This makes it the immutable baseline it was always
meant to be. Orders without a proposal keep their existing value.

### 2. Repairs `contract_total`
Recalculates `contract_total` for every sales order as:
  `original_contract_total + SUM(approved, billable CO change_amount + tax_amount)`

This is the correct formula: the proposal baseline plus the signed net impact
of all approved billable change orders (negative COs subtract, positive COs add).

### 3. Adds a trigger to keep `contract_total` correct going forward
Creates a `recalc_sales_order_contract_total()` function and a trigger that
fires after any change_order INSERT, UPDATE (to status/is_billable/change_amount/
tax_amount), or DELETE. The trigger recalculates the parent sales order's
`contract_total` from scratch using the same formula, so no client-side code
can corrupt it again.

## Security
- No RLS changes. No new tables. No columns added or removed.
- The trigger function runs with SECURITY DEFINER (owner privileges) so it can
  update sales_orders regardless of the calling role's RLS policies, but it only
  touches the single parent sales order of the changed change order.
*/

-- ─── Step 1: Repair original_contract_total from proposal totals ───
UPDATE sales_orders so
SET original_contract_total = p.total
FROM proposals p
WHERE so.proposal_id = p.id
  AND COALESCE(so.original_contract_total, 0) <> COALESCE(p.total, 0);

-- ─── Step 2: Repair contract_total = original_contract_total + approved billable COs ───
UPDATE sales_orders so
SET contract_total = COALESCE(so.original_contract_total, 0) + COALESCE((
  SELECT SUM(
    CASE
      WHEN CO.change_amount < 0 THEN CO.change_amount - ABS(COALESCE(CO.tax_amount, 0))
      ELSE ABS(CO.change_amount) + COALESCE(CO.tax_amount, 0)
    END
  )
  FROM change_orders CO
  WHERE CO.sales_order_id = so.id
    AND CO.status = 'approved'
    AND CO.is_billable <> false
), 0)
WHERE true;

-- ─── Step 3: Create the recalc function ───
CREATE OR REPLACE FUNCTION recalc_sales_order_contract_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sales_order_id uuid;
  v_original_total numeric;
  v_co_total numeric;
  v_new_contract_total numeric;
BEGIN
  -- Determine which sales order to recalculate
  IF TG_OP = 'DELETE' THEN
    v_sales_order_id := OLD.sales_order_id;
  ELSIF TG_OP = 'INSERT' THEN
    v_sales_order_id := NEW.sales_order_id;
  ELSE
    -- UPDATE: if sales_order_id changed, recalc both old and new parent
    IF NEW.sales_order_id IS DISTINCT FROM OLD.sales_order_id THEN
      -- Recalc old parent
      SELECT COALESCE(so.original_contract_total, 0) INTO v_original_total
      FROM sales_orders so WHERE so.id = OLD.sales_order_id;
      SELECT COALESCE(SUM(
        CASE WHEN CO.change_amount < 0 THEN CO.change_amount - ABS(COALESCE(CO.tax_amount, 0))
             ELSE ABS(CO.change_amount) + COALESCE(CO.tax_amount, 0) END
      ), 0) INTO v_co_total
      FROM change_orders CO
      WHERE CO.sales_order_id = OLD.sales_order_id
        AND CO.status = 'approved' AND CO.is_billable <> false;
      UPDATE sales_orders SET contract_total = v_original_total + v_co_total
      WHERE id = OLD.sales_order_id;
    END IF;
    v_sales_order_id := NEW.sales_order_id;
  END IF;

  -- Recalc the (new) parent sales order
  SELECT COALESCE(so.original_contract_total, 0) INTO v_original_total
  FROM sales_orders so WHERE so.id = v_sales_order_id;

  SELECT COALESCE(SUM(
    CASE WHEN CO.change_amount < 0 THEN CO.change_amount - ABS(COALESCE(CO.tax_amount, 0))
         ELSE ABS(CO.change_amount) + COALESCE(CO.tax_amount, 0) END
  ), 0) INTO v_co_total
  FROM change_orders CO
  WHERE CO.sales_order_id = v_sales_order_id
    AND CO.status = 'approved'
    AND CO.is_billable <> false;

  v_new_contract_total := v_original_total + v_co_total;

  UPDATE sales_orders
  SET contract_total = v_new_contract_total
  WHERE id = v_sales_order_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- ─── Step 4: Create the trigger (drop if exists first for idempotency) ───
DROP TRIGGER IF EXISTS trg_recalc_contract_total_on_co_change ON change_orders;

CREATE TRIGGER trg_recalc_contract_total_on_co_change
AFTER INSERT OR UPDATE OF sales_order_id, status, is_billable, change_amount, tax_amount
OR DELETE ON change_orders
FOR EACH ROW
EXECUTE FUNCTION recalc_sales_order_contract_total();
