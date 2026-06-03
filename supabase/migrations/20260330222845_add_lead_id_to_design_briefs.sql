/*
  # Add lead_id to design_briefs

  ## Summary
  Allows design briefs to be linked to a lead (from the leads table) in addition
  to contacts. Previously only contacts were searchable; now leads appear in the
  customer search as well.

  ## Changes
  - Added `lead_id` column (uuid, nullable FK to leads) on `design_briefs`
  - Added index on `lead_id` for performance
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'design_briefs' AND column_name = 'lead_id'
  ) THEN
    ALTER TABLE design_briefs ADD COLUMN lead_id uuid REFERENCES leads(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_design_briefs_lead_id ON design_briefs(lead_id);
  END IF;
END $$;
