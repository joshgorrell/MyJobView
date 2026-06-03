/*
  # Multi-State Jurisdiction Schema

  ## Summary
  Adds multi-state support to the tax jurisdiction system, enabling the app to
  track sales tax nexus across multiple states and store per-state filing codes
  without requiring schema changes each time a new state is added.

  ## Changes

  ### tax_jurisdictions table
  - `state_filing_codes` (jsonb) — flexible key/value store for state-specific
    filing codes. Example: {"KS": "030-007", "MO": "12-345"}. Replaces the
    need for individual ks_jurisdiction_code, mo_jurisdiction_code columns.
    The existing `ks_jurisdiction_code` column is preserved for backward compat.
  - `mo_jurisdiction_code` (text) — Missouri district/location code for Form 53-1

  ### company_settings table
  - `nexus_states` (text[]) — array of two-letter state codes where the company
    has sales tax nexus (e.g., ['KS', 'MO']). Controls which report tabs appear.
  - Default: ['KS'] so existing installations aren't affected.
*/

-- Add state_filing_codes JSONB column to tax_jurisdictions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tax_jurisdictions' AND column_name = 'state_filing_codes'
  ) THEN
    ALTER TABLE tax_jurisdictions ADD COLUMN state_filing_codes jsonb DEFAULT '{}';
  END IF;
END $$;

-- Add Missouri-specific jurisdiction code column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tax_jurisdictions' AND column_name = 'mo_jurisdiction_code'
  ) THEN
    ALTER TABLE tax_jurisdictions ADD COLUMN mo_jurisdiction_code text;
  END IF;
END $$;

-- Backfill state_filing_codes from existing ks_jurisdiction_code values
UPDATE tax_jurisdictions
SET state_filing_codes = jsonb_build_object('KS', ks_jurisdiction_code)
WHERE ks_jurisdiction_code IS NOT NULL
  AND (state_filing_codes IS NULL OR state_filing_codes = '{}');

-- Add nexus_states array to company_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'nexus_states'
  ) THEN
    ALTER TABLE company_settings
      ADD COLUMN nexus_states text[] DEFAULT ARRAY['KS']::text[];
  END IF;
END $$;

-- Index for fast state-based jurisdiction queries
CREATE INDEX IF NOT EXISTS idx_tax_jurisdictions_state
  ON tax_jurisdictions (organization_id, state, is_active);
