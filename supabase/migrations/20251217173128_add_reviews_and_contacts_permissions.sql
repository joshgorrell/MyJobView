/*
  # Add Reviews and Contacts Permissions

  1. Changes
    - Add `can_see_all_review_requests` column to profiles table (default false)
    - Add `can_edit_contacts` column to profiles table (default true for backward compatibility)
    - Update review_requests RLS policies to respect visibility permission
    - Update contacts RLS policies to restrict editing based on permission

  2. Security
    - Review requests: Users can only see their own by default unless granted permission
    - Contacts: All users can view, but only users with permission can edit/delete
*/

-- Add the permission columns
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS can_see_all_review_requests boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS can_edit_contacts boolean DEFAULT true;

-- Set defaults based on role for review requests visibility
UPDATE profiles 
SET can_see_all_review_requests = CASE 
  WHEN role IN ('admin', 'manager', 'sales', 'service_manager') THEN true
  ELSE false
END
WHERE can_see_all_review_requests IS NULL OR can_see_all_review_requests = false;

-- Set defaults based on role for contacts editing
UPDATE profiles 
SET can_edit_contacts = CASE 
  WHEN role IN ('admin', 'manager', 'sales', 'sales_v2', 'production_manager', 'service_manager') THEN true
  WHEN role IN ('tech', 'portal_user') THEN false
  ELSE true
END
WHERE can_edit_contacts IS NULL;

-- Update review_requests SELECT policy to respect visibility permission
DROP POLICY IF EXISTS "Users can view company review requests" ON review_requests;
CREATE POLICY "Users can view review requests"
  ON review_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (
        profiles.can_see_all_review_requests = true
        OR review_requests.sent_by = auth.uid()
      )
    )
  );

-- Update contacts INSERT policy
DROP POLICY IF EXISTS "Users can insert contacts" ON contacts;
CREATE POLICY "Users can insert contacts"
  ON contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.can_edit_contacts = true
    )
  );

-- Update contacts UPDATE policy
DROP POLICY IF EXISTS "Users can update contacts" ON contacts;
CREATE POLICY "Users can update contacts"
  ON contacts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.can_edit_contacts = true
    )
  );

-- Update contacts DELETE policy
DROP POLICY IF EXISTS "Users can delete contacts" ON contacts;
CREATE POLICY "Users can delete contacts"
  ON contacts
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.can_edit_contacts = true
    )
  );

-- SELECT policy remains unchanged - all authenticated users can view contacts
