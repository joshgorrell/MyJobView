/*
  # Fix Security Contracts Finance Access
  
  Adds 'finance' role to security contracts RLS policies.
  
  ## Changes
  - Updates INSERT policy to include 'finance' role
  - Updates SELECT policy to include 'finance' role
  - Updates UPDATE policy to include 'finance' role
  - Ensures Finance department can manage security contracts
  
  ## Security
  - Finance role can create, view, and update contracts
  - Maintains proper ownership and role-based access controls
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Sales staff can create contracts" ON security_contracts;
DROP POLICY IF EXISTS "Users can view their own contracts" ON security_contracts;
DROP POLICY IF EXISTS "Users can update their own contracts" ON security_contracts;

-- Recreate INSERT policy with finance role
CREATE POLICY "Sales and finance staff can create contracts"
ON security_contracts FOR INSERT
TO authenticated
WITH CHECK (
  created_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('sales', 'sales_v2', 'sales_manager', 'finance', 'admin', 'owner')
  )
);

-- Recreate SELECT policy with finance role
CREATE POLICY "Users can view contracts based on role"
ON security_contracts FOR SELECT
TO authenticated
USING (
  created_by_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('sales_manager', 'finance', 'admin', 'owner')
  )
);

-- Recreate UPDATE policy with finance role
CREATE POLICY "Users can update contracts based on role"
ON security_contracts FOR UPDATE
TO authenticated
USING (
  created_by_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('sales_manager', 'finance', 'admin', 'owner')
  )
);
