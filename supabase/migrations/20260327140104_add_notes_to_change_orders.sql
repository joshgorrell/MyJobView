/*
  # Add notes column to change_orders

  ## Summary
  Adds an internal `notes` field to the `change_orders` table so users can
  attach free-form notes to a change order at any time — during creation or
  after the fact — without needing to open the full proposal editor.

  ## Changes
  - `change_orders`: new nullable `notes` text column

  ## Notes
  - Column is nullable; no existing rows are affected.
  - No RLS changes needed; the column inherits existing table policies.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_orders' AND column_name = 'notes'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN notes text;
  END IF;
END $$;
