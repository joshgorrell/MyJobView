/*
  # Fix $0.00 line_total values and add auto-compute trigger

  ## Problem
  Some proposal_line_items rows have unit_price > 0 but line_total = 0.
  This happens when items are inserted (via approval flow, revision copy, or
  duplicate operations) without computing line_total = quantity * unit_price.

  ## Changes

  ### 1. Data Fix
  - Recalculate line_total for all rows where unit_price > 0 but line_total = 0
  - Recalculate labor_total for rows where labor_hours > 0, labor_rate > 0 but labor_total = 0
  - Then re-run calculate_proposal_totals for any proposals whose totals are affected

  ### 2. Trigger
  - Add BEFORE INSERT OR UPDATE trigger on proposal_line_items
  - Auto-computes line_total = quantity * unit_price whenever line_total is NULL or 0
    and unit_price > 0
  - Auto-computes labor_total = labor_hours * labor_rate whenever labor_total is NULL or 0
    and both labor_hours and labor_rate > 0

  ### Important Notes
  - Data fix is safe: only touches rows where line_total = 0 AND unit_price > 0
  - Trigger is BEFORE so it fires before RLS checks and constraints
  - Does not touch intentionally-zero-priced items (unit_price = 0)
*/

-- ─────────────────────────────────────────────────────────────
-- STEP 1: Fix existing $0.00 line_total rows
-- ─────────────────────────────────────────────────────────────
UPDATE proposal_line_items
SET
  line_total = quantity * unit_price,
  updated_at = now()
WHERE
  unit_price > 0
  AND quantity > 0
  AND (line_total IS NULL OR line_total = 0);

-- Fix labor_total = 0 where labor_hours and labor_rate are both set
UPDATE proposal_line_items
SET
  labor_total = labor_hours * labor_rate,
  updated_at = now()
WHERE
  labor_hours > 0
  AND labor_rate > 0
  AND (labor_total IS NULL OR labor_total = 0);

-- ─────────────────────────────────────────────────────────────
-- STEP 2: Recalculate proposal-level totals for any proposals
--         that had broken line items
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_proposal_id uuid;
BEGIN
  FOR v_proposal_id IN
    SELECT DISTINCT proposal_id
    FROM proposal_line_items
    WHERE updated_at >= now() - interval '10 seconds'
  LOOP
    PERFORM calculate_proposal_totals(v_proposal_id);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────
-- STEP 3: Create trigger function to auto-compute line_total
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_compute_line_item_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Auto-compute line_total if unit_price is set but line_total is missing/zero
  IF NEW.unit_price IS NOT NULL AND NEW.unit_price > 0
     AND NEW.quantity IS NOT NULL AND NEW.quantity > 0
     AND (NEW.line_total IS NULL OR NEW.line_total = 0)
  THEN
    NEW.line_total := NEW.quantity * NEW.unit_price;
  END IF;

  -- Auto-compute labor_total if labor_hours and labor_rate are set but labor_total is missing/zero
  IF NEW.labor_hours IS NOT NULL AND NEW.labor_hours > 0
     AND NEW.labor_rate IS NOT NULL AND NEW.labor_rate > 0
     AND (NEW.labor_total IS NULL OR NEW.labor_total = 0)
  THEN
    NEW.labor_total := NEW.labor_hours * NEW.labor_rate;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then re-create
DROP TRIGGER IF EXISTS trg_auto_compute_line_item_totals ON proposal_line_items;

CREATE TRIGGER trg_auto_compute_line_item_totals
  BEFORE INSERT OR UPDATE ON proposal_line_items
  FOR EACH ROW
  EXECUTE FUNCTION auto_compute_line_item_totals();
