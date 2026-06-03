/*
  # Add Follow-up Description to Connections

  1. Changes
    - Add `follow_up_description` column to `connections` table to store details about the follow-up action
    - Add `completed_at` column to track when a follow-up is marked as complete
  
  2. Notes
    - The description field will help users document what they need to do during the follow-up
    - The completed_at field allows tracking completion status without deleting the record
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'connections' AND column_name = 'follow_up_description'
  ) THEN
    ALTER TABLE connections ADD COLUMN follow_up_description text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'connections' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE connections ADD COLUMN completed_at timestamptz;
  END IF;
END $$;
