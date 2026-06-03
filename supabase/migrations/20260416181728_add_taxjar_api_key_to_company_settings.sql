/*
  # Add TaxJar API Key to Company Settings

  1. Purpose
    - Replace ZIP-Tax integration with TaxJar as the sole tax rate provider
    - Store the TaxJar live token inside the company_settings table so
      administrators can configure it from the admin UI

  2. Changes
    - Add `taxjar_api_key` (text) to `company_settings`
    - Add `taxjar_api_key_updated_at` (timestamptz) to `company_settings`
      so the UI can surface when the key was last rotated

  3. Notes
    - We do NOT drop the legacy `zip_tax_api_key` or `zip_tax_api_key_updated_at`
      columns here. They are left in place to avoid data loss and will be
      ignored by the application. They can be removed in a future cleanup.
    - No RLS changes are required because company_settings already has
      appropriate policies for authenticated users.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'taxjar_api_key'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN taxjar_api_key text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'taxjar_api_key_updated_at'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN taxjar_api_key_updated_at timestamptz;
  END IF;
END $$;
