/*
  # Add Lead Priority Field

  1. Changes
    - Add `priority` column to leads table
      - Values: 'low', 'medium', 'high', 'urgent'
      - Default: 'medium'
    - Add index on priority for filtering

  2. Notes
    - Priority indicates how quickly a lead needs follow-up
    - Urgent: Follow up within hours
    - High: Follow up within 1 day
    - Medium: Follow up within 3 days
    - Low: Follow up within 1 week
*/

-- Add priority column to leads table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'priority'
  ) THEN
    ALTER TABLE leads ADD COLUMN priority text NOT NULL DEFAULT 'medium' 
    CHECK (priority IN ('low', 'medium', 'high', 'urgent'));
  END IF;
END $$;

-- Create index on priority
CREATE INDEX IF NOT EXISTS idx_leads_priority ON leads(priority);