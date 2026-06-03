/*
  # Fix Security Contract Templates Finance Access
  
  Adds 'finance' role to security contract templates RLS policies.
  
  ## Changes
  - Updates SELECT policy to include 'finance' role
  - Ensures Finance department can access security contract templates
  
  ## Security
  - Finance role can view templates (required for creating contracts)
  - Admin/Owner retain full management access
*/

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Sales and managers can view templates" ON security_contract_templates;

-- Recreate SELECT policy with finance role included
CREATE POLICY "Sales, finance, and managers can view templates"
ON security_contract_templates FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('sales', 'sales_v2', 'sales_manager', 'finance', 'admin', 'owner')
  )
);
