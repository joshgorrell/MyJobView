/*
  # Add App URL to Company Settings

  ## Summary
  Adds an `app_url` column to `company_settings` to store the main application
  URL. This is used by edge functions (like send-satisfaction-email) to generate
  correct callback links in outgoing emails.

  ## Changes

  ### Modified Tables
  - `company_settings`
    - `app_url` (text, nullable) - The URL of the main application (e.g. https://yourapp.com)

  ## Notes
  1. This is non-destructive; existing rows are unaffected
  2. Edge functions fall back to APP_URL env var or the hardcoded default if this is null
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'app_url'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN app_url text;
  END IF;
END $$;
