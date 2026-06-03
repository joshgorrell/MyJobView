/*
  # Add Temperature Tracking to Contacts

  1. Changes
    - Add `temperature` column to contacts table
    - Temperature levels: cold, warm, hot, on_fire
    - Applies to both prospects and leads
    - Default is 'warm' for new contacts
    
  2. Notes
    - Temperature helps prioritize follow-up actions
    - Both prospects and leads can have varying temperatures
    - Higher temperature = more urgent/interested
*/

-- Add temperature column to contacts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'temperature'
  ) THEN
    ALTER TABLE contacts 
    ADD COLUMN temperature text CHECK (temperature IN ('cold', 'warm', 'hot', 'on_fire')) DEFAULT 'warm';
    
    CREATE INDEX IF NOT EXISTS idx_contacts_temperature ON contacts(temperature);
  END IF;
END $$;