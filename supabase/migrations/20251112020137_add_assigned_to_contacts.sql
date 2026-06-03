/*
  # Add assigned_to field to contacts
  
  1. Changes
    - Add `assigned_to` column to `contacts` table
      - References `profiles` table (the sales rep assigned to this contact)
      - Nullable (contacts may not be assigned yet)
      - Defaults to the creator (created_by) for existing contacts
    
  2. Security
    - Update RLS policies to allow admins to update assigned_to
    - Sales reps can view and update contacts assigned to them
*/

-- Add assigned_to column to contacts table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'assigned_to'
  ) THEN
    ALTER TABLE contacts ADD COLUMN assigned_to uuid REFERENCES profiles(id);
  END IF;
END $$;

-- Set default assigned_to to created_by for existing contacts
UPDATE contacts 
SET assigned_to = created_by 
WHERE assigned_to IS NULL;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_contacts_assigned_to ON contacts(assigned_to);

-- Update the contacts select policy to include contacts assigned to user
DROP POLICY IF EXISTS "Users can view contacts in their company" ON contacts;

CREATE POLICY "Users can view contacts in their company"
  ON contacts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p1
      JOIN user_offices uo1 ON p1.id = uo1.user_id
      WHERE p1.id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM profiles p2
        JOIN user_offices uo2 ON p2.id = uo2.user_id
        WHERE p2.id = contacts.created_by
        AND uo1.office_id = uo2.office_id
      )
    ) OR
    created_by = auth.uid() OR
    assigned_to = auth.uid()
  );

-- Update policy to allow users to update contacts they created or are assigned to, or if admin
DROP POLICY IF EXISTS "Users can update own contacts" ON contacts;

CREATE POLICY "Users can update contacts they created or assigned to"
  ON contacts
  FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid() OR
    assigned_to = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    created_by = auth.uid() OR
    assigned_to = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );