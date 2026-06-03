/*
  # Add Sales Tracking Columns to Leads

  ## Changes
  - Add `estimated_value` column to track deal size
  - Add `last_contact_date` column to track lead engagement
  
  ## Purpose
  These columns are essential for the Sales Dashboard to:
  1. Calculate pipeline value from open leads
  2. Track average deal size
  3. Identify stale leads that need follow-up
  4. Calculate conversion metrics
*/

-- Add estimated_value for pipeline tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'estimated_value'
  ) THEN
    ALTER TABLE leads ADD COLUMN estimated_value numeric DEFAULT 0;
  END IF;
END $$;

-- Add last_contact_date for engagement tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'last_contact_date'
  ) THEN
    ALTER TABLE leads ADD COLUMN last_contact_date timestamptz;
  END IF;
END $$;

-- Set last_contact_date to created_at for existing leads as a starting point
UPDATE leads 
SET last_contact_date = created_at 
WHERE last_contact_date IS NULL;
