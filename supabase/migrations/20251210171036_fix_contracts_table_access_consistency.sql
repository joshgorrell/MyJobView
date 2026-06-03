/*
  # Fix Contracts Table Access Consistency

  ## Summary
  Update the contracts table (contract templates) to allow all authenticated users
  to insert and update contracts, not just admins. This table is company-wide shared
  and if users have access to contract management pages, they should be able to
  manage contract templates.

  ## Changes Made

  1. **contracts**
     - SELECT: All authenticated users (already correct)
     - INSERT: All authenticated users (changed from admin-only)
     - UPDATE: All authenticated users (changed from admin-only)
     - DELETE: Admin only (keep as is)

  ## Security Notes
  - Access control is managed at the module level
  - Admins retain exclusive delete permissions
  - All staff can create and update contract templates
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can insert contracts" ON contracts;
DROP POLICY IF EXISTS "Admins can update contracts" ON contracts;

-- Create new policies
CREATE POLICY "Authenticated users can insert contracts"
  ON contracts
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update contracts"
  ON contracts
  FOR UPDATE
  TO authenticated
  USING (true);
