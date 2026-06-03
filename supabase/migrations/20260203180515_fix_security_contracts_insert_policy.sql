/*
  # Fix Security Contracts Insert Policy

  1. Changes
    - Add INSERT policy for security_contracts table
    - Allow admin, finance, and service_manager roles to create contracts
  
  2. Security
    - Restricts contract creation to authorized roles only
*/

-- Drop any existing insert policy
DROP POLICY IF EXISTS "Admin and managers can create contracts" ON security_contracts;
DROP POLICY IF EXISTS "Authorized users can create contracts" ON security_contracts;

-- Add INSERT policy for security contracts
CREATE POLICY "Authorized users can create contracts"
  ON security_contracts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'finance', 'service_manager')
    )
  );

-- Also add UPDATE policy for authorized users
DROP POLICY IF EXISTS "Authorized users can update contracts" ON security_contracts;

CREATE POLICY "Authorized users can update contracts"
  ON security_contracts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'finance', 'service_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'finance', 'service_manager')
    )
  );
