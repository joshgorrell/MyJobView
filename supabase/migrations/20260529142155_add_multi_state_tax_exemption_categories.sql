/*
  # Multi-State Tax Exemption Categories & Contact Tax Flags

  ## Summary
  Expands the tax exemption system to support multi-state exemption certificate
  tracking with proper category classification for reporting purposes.

  ## Changes

  ### tax_exemption_certificates table
  - `exemption_category` — type of exemption: non_profit, government, resale,
    agricultural, manufacturer, medical, other
  - `state_form_number` — the state form used (e.g., ST-28 for KS, Form 149 for MO)
  - `buyer_name` — legal buyer name as it appears on the certificate
  - `buyer_address` — buyer address for certificate accuracy

  ### contacts table
  - `government_entity` (boolean) — quick flag for government customers
  - `non_profit_entity` (boolean) — quick flag for non-profit customers

  ## Security
  - RLS policies updated to cover new columns (inherited from existing policies)
  - No policy changes needed — existing policies cover all columns by default
*/

-- Add exemption category and detail columns to tax_exemption_certificates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tax_exemption_certificates' AND column_name = 'exemption_category'
  ) THEN
    ALTER TABLE tax_exemption_certificates
      ADD COLUMN exemption_category text DEFAULT 'other'
        CHECK (exemption_category IN (
          'non_profit', 'government', 'resale', 'agricultural',
          'manufacturer', 'medical', 'other'
        ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tax_exemption_certificates' AND column_name = 'state_form_number'
  ) THEN
    ALTER TABLE tax_exemption_certificates ADD COLUMN state_form_number text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tax_exemption_certificates' AND column_name = 'buyer_name'
  ) THEN
    ALTER TABLE tax_exemption_certificates ADD COLUMN buyer_name text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tax_exemption_certificates' AND column_name = 'buyer_address'
  ) THEN
    ALTER TABLE tax_exemption_certificates ADD COLUMN buyer_address text;
  END IF;
END $$;

-- Add quick-flag columns to contacts for government/non-profit identification
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'government_entity'
  ) THEN
    ALTER TABLE contacts ADD COLUMN government_entity boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'non_profit_entity'
  ) THEN
    ALTER TABLE contacts ADD COLUMN non_profit_entity boolean DEFAULT false;
  END IF;
END $$;

-- Index for fast filtering of exempt customers by type
CREATE INDEX IF NOT EXISTS idx_contacts_government_entity
  ON contacts (organization_id, government_entity)
  WHERE government_entity = true;

CREATE INDEX IF NOT EXISTS idx_contacts_non_profit_entity
  ON contacts (organization_id, non_profit_entity)
  WHERE non_profit_entity = true;

CREATE INDEX IF NOT EXISTS idx_tax_exemption_category
  ON tax_exemption_certificates (organization_id, exemption_category);
