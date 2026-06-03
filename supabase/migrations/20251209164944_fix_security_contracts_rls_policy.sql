/*
  # Fix Security Contracts RLS Policy

  1. Changes
    - Update the INSERT policy for security_contracts to use the correct role values
    - The policy was referencing invalid roles (sales_v2, sales_manager, owner)
    - Update to use actual roles from the profiles table constraint: admin, finance, manager, sales, tech, service_manager
    - Allow admin, finance, manager, and sales roles to create contracts

  2. Security
    - Maintains proper access control
    - Only authorized staff can create security contracts
*/

DROP POLICY IF EXISTS "Sales and finance staff can create contracts" ON security_contracts;

CREATE POLICY "Sales and finance staff can create contracts"
  ON security_contracts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (created_by_user_id = auth.uid()) AND 
    (EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = ANY(ARRAY['sales'::text, 'finance'::text, 'manager'::text, 'admin'::text])
    ))
  );
