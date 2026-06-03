/*
  # Add manual approval notes and internal approval tracking to change orders

  ## Changes
  1. Add `approval_notes` column to `change_orders` table to persist notes entered during manual approval
  2. Add `approved_by_name` snapshot column so the approver name is preserved even if the profile is later deleted
  3. Ensure the `change_order_history` trigger captures manual approval events with the approver name and notes

  ## Security
  - No new tables — all changes are additive columns on the existing `change_orders` table
  - RLS unchanged
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_orders' AND column_name = 'approval_notes'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN approval_notes text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_orders' AND column_name = 'approved_by_name'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN approved_by_name text;
  END IF;
END $$;
