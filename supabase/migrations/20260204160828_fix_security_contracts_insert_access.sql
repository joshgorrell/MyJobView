/*
  # Fix Security Contracts Insert Access

  1. Changes
    - Update INSERT policy for security_contracts to include sales roles
    - Allow sales, sales_v2, sales_manager, finance, service_manager, admin, and owner to create contracts

  2. Security
    - Matches access pattern with security_contract_templates
    - Restricts contract creation to authorized sales and management roles
*/

-- Drop existing insert policy
DROP POLICY IF EXISTS "Authorized users can create contracts" ON security_contracts;

-- Add comprehensive INSERT policy for security contracts
CREATE POLICY "Sales and authorized users can create contracts"
  ON security_contracts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('sales', 'sales_v2', 'sales_manager', 'finance', 'service_manager', 'admin', 'owner')
    )
  );

-- Also update UPDATE policy to match
DROP POLICY IF EXISTS "Authorized users can update contracts" ON security_contracts;

CREATE POLICY "Sales and authorized users can update contracts"
  ON security_contracts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('sales', 'sales_v2', 'sales_manager', 'finance', 'service_manager', 'admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('sales', 'sales_v2', 'sales_manager', 'finance', 'service_manager', 'admin', 'owner')
    )
  );
