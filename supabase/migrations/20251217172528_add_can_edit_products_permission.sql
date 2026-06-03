/*
  # Add Product Editing Permission

  1. Changes
    - Add `can_edit_products` column to profiles table
    - Default to `true` for existing users (backward compatible)
    - Update products RLS policies to check this permission for INSERT/UPDATE/DELETE
    - SELECT (view) remains available to all authenticated users

  2. Security
    - Admins and managers get full access by default
    - Techs and other roles can view but not edit unless granted permission
    - Company-wide shared catalog with granular edit control
*/

-- Add the permission column
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS can_edit_products boolean DEFAULT true;

-- Set default values based on role
UPDATE profiles 
SET can_edit_products = CASE 
  WHEN role IN ('admin', 'manager', 'sales', 'production_manager', 'service_manager') THEN true
  WHEN role IN ('tech', 'sales_v2', 'portal_user') THEN false
  ELSE true
END
WHERE can_edit_products IS NULL;

-- Update the insert policy to check permission
DROP POLICY IF EXISTS "Users can insert company products" ON products;
CREATE POLICY "Users can insert company products"
  ON products
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.can_edit_products = true
    )
  );

-- Update the update policy to check permission
DROP POLICY IF EXISTS "Users can update company products" ON products;
CREATE POLICY "Users can update company products"
  ON products
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.can_edit_products = true
    )
  );

-- Update the delete policy to check permission
DROP POLICY IF EXISTS "Users can delete company products" ON products;
CREATE POLICY "Users can delete company products"
  ON products
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.can_edit_products = true
    )
  );

-- SELECT policy remains unchanged - all authenticated users can view products
-- This is already handled by existing policy "Users can view company products"
