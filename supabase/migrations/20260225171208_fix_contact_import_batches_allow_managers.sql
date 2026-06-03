/*
  # Fix Contact Import Batches - Allow Managers

  ## Problem
  The contact_import_batches table only allows 'admin' role to INSERT/UPDATE/DELETE.
  Managers and other authorized roles who have access to the import feature cannot
  create import batches, causing silent failures showing "0 Imported".

  ## Changes
  - Drop the admin-only INSERT, UPDATE, DELETE policies
  - Recreate them to allow admin, manager, and sales_manager roles
*/

DROP POLICY IF EXISTS "Admins can insert import batches" ON contact_import_batches;
DROP POLICY IF EXISTS "Admins can update import batches" ON contact_import_batches;
DROP POLICY IF EXISTS "Admins can delete import batches" ON contact_import_batches;

CREATE POLICY "Authorized users can insert import batches"
  ON contact_import_batches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = get_user_org_id()
    AND (
      SELECT role FROM profiles WHERE id = auth.uid()
    ) IN ('admin', 'manager', 'sales_manager')
  );

CREATE POLICY "Authorized users can update import batches"
  ON contact_import_batches
  FOR UPDATE
  TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND (
      SELECT role FROM profiles WHERE id = auth.uid()
    ) IN ('admin', 'manager', 'sales_manager')
  )
  WITH CHECK (
    organization_id = get_user_org_id()
    AND (
      SELECT role FROM profiles WHERE id = auth.uid()
    ) IN ('admin', 'manager', 'sales_manager')
  );

CREATE POLICY "Authorized users can delete import batches"
  ON contact_import_batches
  FOR DELETE
  TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND (
      SELECT role FROM profiles WHERE id = auth.uid()
    ) IN ('admin', 'manager', 'sales_manager')
  );
