/*
  # Change Order: Billable Flag, Report Visibility, and Sequential Numbering

  ## Summary
  Adds two new fields to change_orders and changes the numbering scheme to be
  per-sales-order sequential (CO1, CO2, CO3...) instead of global.

  ## Changes

  ### New Columns on `change_orders`
  - `is_billable` (boolean, DEFAULT true) — when set to false the customer is not
    charged for this CO; the change_amount is excluded from billing totals.
  - `show_on_report` (boolean, DEFAULT true) — controls whether this CO appears
    on customer-facing reports/exports. Relevant mainly for non-billable COs
    where the work may be internal.

  ### Numbering
  - Replaces the global sequence with a per-sales-order counter so change orders
    are numbered CO1, CO2, CO3 … within each sales order.
  - Existing change orders retain their existing numbers (no backfill needed for
    already-unique global numbers).
  - New trigger function `generate_co_number_per_so` handles generation.

  ## Security
  - No new tables; existing RLS policies on change_orders continue to apply.
*/

-- 1. Add new columns
ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS is_billable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_on_report boolean NOT NULL DEFAULT true;

-- 2. New per-SO sequential numbering function
CREATE OR REPLACE FUNCTION generate_co_number_per_so()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_num integer;
BEGIN
  IF NEW.change_order_number IS NULL OR NEW.change_order_number = '' THEN
    SELECT COALESCE(MAX(
      CASE
        WHEN change_order_number ~ '^CO[0-9]+$'
        THEN (regexp_replace(change_order_number, '^CO', ''))::integer
        ELSE 0
      END
    ), 0) + 1
    INTO v_next_num
    FROM change_orders
    WHERE sales_order_id = NEW.sales_order_id;

    NEW.change_order_number := 'CO' || v_next_num::text;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Replace the old trigger
DROP TRIGGER IF EXISTS set_change_order_number ON change_orders;
CREATE TRIGGER set_change_order_number
  BEFORE INSERT ON change_orders
  FOR EACH ROW
  EXECUTE FUNCTION generate_co_number_per_so();
