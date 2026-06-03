/*
  # Add Security Account Info Fields to security_contracts

  ## Summary
  Adds four new columns to the security_contracts table to track account classification,
  service types, renewal terms, and account numbers for reporting and analytics.

  ## New Columns
  - `account_type` (text): Residential or commercial classification for the account
  - `account_services` (text[]): Array of service types this account has (monitored_alarm,
    testing_inspection, service_agreement, video_monitoring, access_control, other)
  - `renewal_term_months` (integer): Length of each renewal period in months (may differ from initial term)
  - `account_number` (text): Optional human-readable account identifier for the monitoring station

  ## Notes
  - account_services uses a Postgres array to support multiple services per contract
  - No RLS changes needed — inherits existing security_contracts policies
  - All columns are nullable to preserve compatibility with existing records
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'security_contracts' AND column_name = 'account_type'
  ) THEN
    ALTER TABLE security_contracts ADD COLUMN account_type text CHECK (account_type IN ('residential', 'commercial'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'security_contracts' AND column_name = 'account_services'
  ) THEN
    ALTER TABLE security_contracts ADD COLUMN account_services text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'security_contracts' AND column_name = 'renewal_term_months'
  ) THEN
    ALTER TABLE security_contracts ADD COLUMN renewal_term_months integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'security_contracts' AND column_name = 'account_number'
  ) THEN
    ALTER TABLE security_contracts ADD COLUMN account_number text;
  END IF;
END $$;
