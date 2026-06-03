/*
  # Add notes_public flag to change_orders

  ## Summary
  Adds a boolean column `notes_public` to the `change_orders` table to control
  whether the change order notes are customer-facing or internal only.

  ## Changes
  - `change_orders.notes_public` (boolean, DEFAULT false)
    - false = internal only (staff can see, customers cannot)
    - true  = public, will print on the change order PDF report and
              financial summary wherever the change order is listed

  ## Notes
  - Existing rows default to false (internal), preserving prior behavior.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_orders' AND column_name = 'notes_public'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN notes_public boolean NOT NULL DEFAULT false;
  END IF;
END $$;
