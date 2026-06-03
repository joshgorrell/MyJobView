/*
  # Enhance Company Settings for MyJobView

  1. Changes
    - Add `timezone` (text, default 'America/New_York')
    - Add `currency` (text, default 'USD')
    - Add `default_tax_rate` (numeric)
    - Add `default_invoice_terms` (text)
    - Add `qbo_connected` (boolean)
    - Add `qbo_realm_id` (text) - QuickBooks Company ID
    - Add `qbo_access_token` (text, encrypted in practice)
    - Add `qbo_refresh_token` (text, encrypted in practice)
    - Add `qbo_token_expires_at` (timestamptz)
    - Add `qbo_payments_enabled` (boolean)
    - Add `portal_io_connected` (boolean)
    - Add `portal_io_access_token` (text)
    - Add `portal_io_token_expires_at` (timestamptz)
    - Add `commission_settings` (jsonb) - Default commission rates
    - Add `address` (text)
    - Add `phone` (text)
    - Add `primary_contact_email` (text)

  2. Notes
    - OAuth tokens should be encrypted in production
    - commission_settings structure: {sales_rate: 5.0, design_rate: 2.5, pm_rate: 1.0, service_rate: 3.0}
*/

DO $$
BEGIN
  -- Timezone
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'timezone'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN timezone text DEFAULT 'America/New_York';
  END IF;

  -- Currency
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'currency'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN currency text DEFAULT 'USD';
  END IF;

  -- Default tax rate
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'default_tax_rate'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN default_tax_rate numeric(5,2) DEFAULT 0;
  END IF;

  -- Default invoice terms
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'default_invoice_terms'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN default_invoice_terms text DEFAULT 'Net 30';
  END IF;

  -- QuickBooks connection
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'qbo_connected'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN qbo_connected boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'qbo_realm_id'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN qbo_realm_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'qbo_access_token'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN qbo_access_token text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'qbo_refresh_token'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN qbo_refresh_token text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'qbo_token_expires_at'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN qbo_token_expires_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'qbo_payments_enabled'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN qbo_payments_enabled boolean DEFAULT false;
  END IF;

  -- Portal.io connection
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'portal_io_connected'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN portal_io_connected boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'portal_io_access_token'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN portal_io_access_token text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'portal_io_token_expires_at'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN portal_io_token_expires_at timestamptz;
  END IF;

  -- Commission settings
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'commission_settings'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN commission_settings jsonb DEFAULT '{"sales_rate": 5.0, "design_rate": 2.5, "pm_rate": 1.0, "service_rate": 3.0}'::jsonb;
  END IF;

  -- Company contact info
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'address'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN address text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'phone'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN phone text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'primary_contact_email'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN primary_contact_email text;
  END IF;
END $$;
