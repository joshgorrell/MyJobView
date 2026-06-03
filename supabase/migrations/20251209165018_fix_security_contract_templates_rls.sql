/*
  # Fix Security Contract Templates RLS Policies

  1. Changes
    - Update policies to use correct role values from profiles table
    - Replace invalid roles (sales_v2, sales_manager, owner)
    - Use actual roles: admin, finance, manager, sales

  2. Security
    - Admin can manage templates
    - Sales, finance, and managers can view templates
*/

DROP POLICY IF EXISTS "Admin can manage templates" ON security_contract_templates;
DROP POLICY IF EXISTS "Sales, finance, and managers can view templates" ON security_contract_templates;

CREATE POLICY "Admin can manage templates"
  ON security_contract_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Sales, finance, and managers can view templates"
  ON security_contract_templates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = ANY(ARRAY['sales'::text, 'finance'::text, 'manager'::text, 'admin'::text])
    )
  );
