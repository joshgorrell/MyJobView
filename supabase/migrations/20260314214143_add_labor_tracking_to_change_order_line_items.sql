/*
  # Enhance Change Order Line Items for Full Labor Tracking

  ## Summary
  Adds missing columns and action type to `change_order_line_items` to properly
  track labor changes made during change order editing in the proposal builder.

  ## Changes
  1. New columns on `change_order_line_items`:
     - `original_labor_total` (numeric) — labor amount before this CO action
     - `new_labor_total` (numeric) — labor amount after this CO action
  2. Updated `action_type` constraint to include `modify_labor`
  3. All new columns default to 0 for backwards compatibility
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_order_line_items' AND column_name = 'original_labor_total'
  ) THEN
    ALTER TABLE change_order_line_items ADD COLUMN original_labor_total numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_order_line_items' AND column_name = 'new_labor_total'
  ) THEN
    ALTER TABLE change_order_line_items ADD COLUMN new_labor_total numeric DEFAULT 0;
  END IF;
END $$;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'change_order_line_items'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%action_type%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE change_order_line_items DROP CONSTRAINT ' || quote_ident(constraint_name);
  END IF;

  ALTER TABLE change_order_line_items
    ADD CONSTRAINT change_order_line_items_action_type_check
    CHECK (action_type IN ('add', 'remove', 'modify_quantity', 'modify_price', 'modify_labor'));
END $$;
