/*
  # Add remove_scope to change_order_line_items

  ## Summary
  Adds a `remove_scope` column to track whether a CO removal was "parts only" or "parts and labor".

  ## Changes
  - `change_order_line_items` table:
    - New `remove_scope` column (text, nullable) — values: 'parts_only' or 'parts_and_labor'
    - Only populated when action_type = 'remove'

  ## Notes
  - Existing rows keep NULL (treated as 'parts_and_labor' for backwards compat)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_order_line_items' AND column_name = 'remove_scope'
  ) THEN
    ALTER TABLE change_order_line_items
      ADD COLUMN remove_scope text CHECK (remove_scope IN ('parts_only', 'parts_and_labor'));
  END IF;
END $$;
