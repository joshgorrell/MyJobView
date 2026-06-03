/*
  # Update Office Assignments to Use Company Offices

  1. Changes
    - Drop the sales_offices table (if it exists)
    - Update user_offices to reference company_offices instead
    - Update leads.office_id to reference company_offices
    - Keep all existing RLS policies on user_offices

  2. Notes
    - Uses the existing company_offices table from company settings
    - Maintains backward compatibility with existing data
*/

-- Drop sales_offices table if it exists (we'll use company_offices instead)
DROP TABLE IF EXISTS sales_offices CASCADE;

-- Recreate user_offices with correct foreign key
DROP TABLE IF EXISTS user_offices CASCADE;

CREATE TABLE IF NOT EXISTS user_offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  office_id uuid REFERENCES company_offices(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, office_id)
);

-- Update leads table to reference company_offices
DO $$
BEGIN
  -- Drop the old foreign key constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'leads_office_id_fkey' 
    AND table_name = 'leads'
  ) THEN
    ALTER TABLE leads DROP CONSTRAINT leads_office_id_fkey;
  END IF;
  
  -- Add new foreign key constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'office_id'
  ) THEN
    ALTER TABLE leads 
    ADD CONSTRAINT leads_office_id_fkey 
    FOREIGN KEY (office_id) REFERENCES company_offices(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_leads_office_id ON leads(office_id);
CREATE INDEX IF NOT EXISTS idx_user_offices_user_id ON user_offices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_offices_office_id ON user_offices(office_id);

-- Enable RLS
ALTER TABLE user_offices ENABLE ROW LEVEL SECURITY;

-- User Offices Policies
CREATE POLICY "Users can view their own office assignments"
  ON user_offices FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all office assignments"
  ON user_offices FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert office assignments"
  ON user_offices FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete office assignments"
  ON user_offices FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );