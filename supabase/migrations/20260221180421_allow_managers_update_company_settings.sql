/*
  # Allow Managers to Update Company Settings

  1. Changes
    - Drop the existing admin-only UPDATE policy on company_settings
    - Recreate it to also allow manager role users to update

  2. Reason
    - Managers need access to the Kiosk Settings tab to configure kiosk_office_id
    - This is consistent with the decision to show the Kiosk tab to both admins and managers
*/

DROP POLICY IF EXISTS "Admin users can update company settings" ON company_settings;

CREATE POLICY "Admin and manager users can update company settings"
  ON company_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );
