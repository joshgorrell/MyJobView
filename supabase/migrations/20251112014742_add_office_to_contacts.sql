/*
  # Add Office Assignment to Contacts

  1. Changes
    - Add `office_id` column to contacts table
    - Add foreign key constraint to company_offices
    - Add index for efficient queries
    - Update RLS policies (no changes needed, existing policies cover new column)

  2. Notes
    - Office assignment is optional (nullable)
    - Contacts can be assigned to an office to help route leads to appropriate sales reps
    - When a contact is linked to an office, leads created from them can inherit the office
*/

-- Add office_id column to contacts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'office_id'
  ) THEN
    ALTER TABLE contacts ADD COLUMN office_id uuid REFERENCES company_offices(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add index for efficient office-based queries
CREATE INDEX IF NOT EXISTS idx_contacts_office_id ON contacts(office_id);