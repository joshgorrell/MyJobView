/*
# Enforce Cost on Proposal Line Items

## Summary
Ensures every proposal line item has a real cost value greater than zero,
enabling accurate profit margin calculations across sales orders.

## Changes to `proposal_line_items`
1. Backfill existing rows where cost is NULL or 0:
   - First attempt to pull cost from the linked `products` table via `product_id`.
   - Fall back to 50% of `unit_price` as a placeholder estimate if no product cost exists.
2. Set `cost` column to NOT NULL.
3. Add CHECK constraint requiring `cost > 0`.

## Security
- No RLS or policy changes. Existing policies on proposal_line_items remain unchanged.

## Important Notes
- After this migration, any INSERT or UPDATE that sets cost to NULL or 0 will fail
  with a constraint violation. The frontend line item modals must validate cost > 0
  before saving.
*/

-- 1. Backfill: pull cost from products table where possible, fall back to 50% of unit_price
UPDATE proposal_line_items pli
SET cost = COALESCE(
  (SELECT p.cost FROM products p WHERE p.id = pli.product_id AND p.cost > 0),
  pli.unit_price * 0.5
)
WHERE pli.cost IS NULL OR pli.cost = 0;

-- 2. Set NOT NULL
ALTER TABLE proposal_line_items ALTER COLUMN cost SET NOT NULL;

-- 3. Add CHECK constraint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'proposal_line_items_cost_positive'
      AND conrelid = 'proposal_line_items'::regclass
  ) THEN
    ALTER TABLE proposal_line_items
    ADD CONSTRAINT proposal_line_items_cost_positive CHECK (cost > 0);
  END IF;
END $$;
