/*
  # Add follow-up cleared tracking to customer_satisfaction

  1. Changes
    - Add `follow_up_cleared_at` (timestamptz) - when the admin marked it resolved
    - Add `follow_up_cleared_by` (uuid, FK to profiles) - which admin cleared it
  2. Notes
    - NULL means not yet cleared (still needs follow-up)
    - Cleared entries are hidden from the "Needs Follow-Up" list by default
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_satisfaction' AND column_name = 'follow_up_cleared_at'
  ) THEN
    ALTER TABLE customer_satisfaction ADD COLUMN follow_up_cleared_at timestamptz DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_satisfaction' AND column_name = 'follow_up_cleared_by'
  ) THEN
    ALTER TABLE customer_satisfaction ADD COLUMN follow_up_cleared_by uuid DEFAULT NULL
      REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customer_satisfaction_follow_up_cleared
  ON customer_satisfaction(follow_up_cleared_at)
  WHERE follow_up_cleared_at IS NULL;
