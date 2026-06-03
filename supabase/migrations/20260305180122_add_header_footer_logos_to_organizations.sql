/*
  # Add Branding Logo Columns to Organizations

  ## Summary
  Adds two new optional columns to the `organizations` table for per-tenant branding:

  ## New Columns
  - `header_logo_url` (text, nullable) - URL of the logo displayed in the top navigation header.
    Falls back to the MyJobView placeholder when NULL.
  - `footer_logo_url` (text, nullable) - URL of the logo displayed in the bottom footer strip.
    Falls back to the "MyJobView" text when NULL.

  ## Notes
  - Both columns are nullable; existing rows are unaffected and will use the built-in fallbacks.
  - No destructive changes; only additive.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'header_logo_url'
  ) THEN
    ALTER TABLE organizations ADD COLUMN header_logo_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'footer_logo_url'
  ) THEN
    ALTER TABLE organizations ADD COLUMN footer_logo_url text;
  END IF;
END $$;
