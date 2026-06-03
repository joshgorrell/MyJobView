/*
  # Fix labor_total to scale with quantity

  ## Problem
  Both the `calculate_proposal_line_item_labor` trigger function and the
  `auto_compute_line_item_totals` trigger function calculate labor_total as:

      labor_total = labor_hours * labor_rate

  This ignores quantity entirely. If a customer orders 5 of an item that each
  require 1 hour of labor, the stored labor_total reflects only 1 item.

  ## Changes

  ### 1. Redefine calculate_proposal_line_item_labor
  - Updated formula: labor_total = labor_hours * quantity * labor_rate
  - Applies to ALL item types (material, labor-only, both)
  - quantity defaults to 1 if NULL to avoid zero results

  ### 2. Redefine auto_compute_line_item_totals
  - The zero-guard branch that auto-fills a missing labor_total also now
    multiplies by quantity

  ### 3. Backfill all existing proposal_line_items
  - Recalculate labor_total = labor_hours * quantity * labor_rate for every
    row where labor_hours > 0 and labor_rate > 0
  - Then re-run calculate_proposal_totals for every affected proposal so
    proposal-level totals are also corrected
*/

-- ─────────────────────────────────────────────────────────────
-- STEP 1: Redefine the primary labor-total trigger function
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION calculate_proposal_line_item_labor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.labor_hours IS NOT NULL AND NEW.labor_rate IS NOT NULL THEN
    NEW.labor_total := NEW.labor_hours * COALESCE(NEW.quantity, 1) * NEW.labor_rate;
  ELSE
    NEW.labor_total := 0;
  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- STEP 2: Redefine the auto-compute zero-guard trigger function
--         so its labor_total branch also multiplies by quantity
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
    NEW.labor_total := NEW.labor_hours * COALESCE(NEW.quantity, 1) * NEW.labor_rate;
  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- STEP 3: Backfill all existing rows
--         Recalculate labor_total = labor_hours * quantity * labor_rate
--         for every row where labor is configured
-- ─────────────────────────────────────────────────────────────
UPDATE proposal_line_items
SET
  labor_total = labor_hours * COALESCE(quantity, 1) * labor_rate,
  updated_at  = now()
WHERE
  labor_hours IS NOT NULL
  AND labor_hours > 0
  AND labor_rate IS NOT NULL
  AND labor_rate > 0;

-- ─────────────────────────────────────────────────────────────
-- STEP 4: Re-run proposal-level totals for every proposal
--         whose line items were just updated
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
