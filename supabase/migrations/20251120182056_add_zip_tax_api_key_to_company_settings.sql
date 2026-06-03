/*
  # Add ZIP-Tax API Key to Company Settings

  1. Changes
    - Add `zip_tax_api_key` column to `company_settings` table
    - This allows administrators to configure their own ZIP-Tax API key for automatic tax rate lookups
    - Free API keys are available at zip-tax.com with 100 requests/day
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'zip_tax_api_key'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN zip_tax_api_key text;
  END IF;
END $$;