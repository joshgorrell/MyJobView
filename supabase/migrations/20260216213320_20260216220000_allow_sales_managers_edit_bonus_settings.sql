/*
  # Allow Sales Managers to Edit Bonus Pool Settings

  1. Changes
    - Update test_tune_settings RLS policy to allow sales_manager role to update settings
    - Sales managers can now adjust:
      - Bonus pool split percentages (tech/PM)
      - Performance tier thresholds and percentages
      - Labor burden rates
      - On-target bonus amounts
      - Test & Tune period settings

  2. Security
    - Maintains read access for all management roles (admin, finance, production_manager, sales_manager, office_manager)
    - Extends write access to include sales_manager alongside admin
    - All changes are audited via updated_at timestamp
*/

-- Drop existing update policy
DROP POLICY IF EXISTS "Admins can update test tune settings" ON test_tune_settings;

-- Create new policy allowing both admin and sales_manager to update
CREATE POLICY "Admin and sales managers can update test tune settings"
  ON test_tune_settings FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'sales_manager')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'sales_manager')
  ));

-- Add updated_at trigger if not exists
CREATE OR REPLACE FUNCTION update_test_tune_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_test_tune_settings_timestamp ON test_tune_settings;

CREATE TRIGGER trigger_update_test_tune_settings_timestamp
  BEFORE UPDATE ON test_tune_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_test_tune_settings_timestamp();
