/*
  # Fix Remaining Security Contracts RLS Policies

  1. Changes
    - Update SELECT and UPDATE policies to use correct role values
    - Replace references to invalid roles (sales_v2, sales_manager, owner)
    - Use actual roles: admin, finance, manager, sales, tech, service_manager

  2. Security
    - Users can view contracts they created or if they're admin/finance/manager
    - Users can update contracts they created or if they're admin/finance/manager
    - Only admin can delete contracts
*/

DROP POLICY IF EXISTS "Users can view contracts based on role" ON security_contracts;
DROP POLICY IF EXISTS "Users can update contracts based on role" ON security_contracts;
DROP POLICY IF EXISTS "Admin can delete contracts" ON security_contracts;

CREATE POLICY "Users can view contracts based on role"
  ON security_contracts
  FOR SELECT
  TO authenticated
  USING (
    (created_by_user_id = auth.uid()) OR 
    (EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = ANY(ARRAY['finance'::text, 'manager'::text, 'admin'::text])
    ))
  );

CREATE POLICY "Users can update contracts based on role"
  ON security_contracts
  FOR UPDATE
  TO authenticated
  USING (
    (created_by_user_id = auth.uid()) OR 
    (EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = ANY(ARRAY['finance'::text, 'manager'::text, 'admin'::text])
    ))
  );

CREATE POLICY "Admin can delete contracts"
  ON security_contracts
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
