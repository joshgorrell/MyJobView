/*
  # Sales Tax Management System

  1. New Tables
    - `tax_jurisdictions`
      - Stores tax rates by zip code, city, county, state
      - Supports multiple tax authorities (state, county, city, special district)
      - Date-effective rates for historical accuracy
      - Default company-wide rate fallback

    - `tax_exemption_certificates`
      - Stores exemption certificates per contact
      - Certificate number, expiration date, issuing authority
      - Links to uploaded certificate documents
      - Tracks validity status

    - `project_tax_classifications`
      - Stores tax classification per proposal/invoice
      - Environment (Residential/Commercial)
      - Project type (Original Construction, Remodel, etc.)
      - Override flags for special cases

  2. Enhanced Tables
    - Add tax-related columns to `contacts`
    - Add tax-related columns to `proposals`
    - Add tax-related columns to `proposal_line_items`
    - Add tax-related columns to `invoices`
    - Add tax-related columns to `invoice_line_items`

  3. Security
    - Enable RLS on all new tables
    - Admin and Manager roles can manage tax settings
    - All authenticated users can view tax rates
    - Only assigned users can view exemption certificates
*/

-- Tax Jurisdictions Table
CREATE TABLE IF NOT EXISTS tax_jurisdictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES auth.users(id),

  -- Location identifiers
  zip_code text,
  city text,
  county text,
  state text NOT NULL,

  -- Tax rate details
  combined_rate decimal(5,4) NOT NULL,
  state_rate decimal(5,4) DEFAULT 0,
  county_rate decimal(5,4) DEFAULT 0,
  city_rate decimal(5,4) DEFAULT 0,
  special_rate decimal(5,4) DEFAULT 0,

  -- Metadata
  jurisdiction_name text NOT NULL,
  effective_date date DEFAULT CURRENT_DATE,
  end_date date,
  is_active boolean DEFAULT true,
  is_default boolean DEFAULT false,

  -- Source tracking
  source text DEFAULT 'manual',
  last_verified_at timestamptz,
  notes text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT valid_rates CHECK (
    combined_rate >= 0 AND combined_rate <= 1 AND
    state_rate >= 0 AND county_rate >= 0 AND
    city_rate >= 0 AND special_rate >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_tax_jurisdictions_zip ON tax_jurisdictions(zip_code) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tax_jurisdictions_company ON tax_jurisdictions(company_id);
CREATE INDEX IF NOT EXISTS idx_tax_jurisdictions_default ON tax_jurisdictions(company_id, is_default) WHERE is_default = true;

-- Tax Exemption Certificates Table
CREATE TABLE IF NOT EXISTS tax_exemption_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES auth.users(id),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,

  -- Certificate details
  certificate_number text NOT NULL,
  certificate_type text NOT NULL,
  issuing_authority text NOT NULL,
  issuing_state text NOT NULL,

  -- Validity
  issue_date date NOT NULL,
  expiration_date date,
  is_active boolean DEFAULT true,

  -- File storage
  certificate_file_path text,
  certificate_file_name text,

  -- Metadata
  notes text,
  verified_by uuid REFERENCES auth.users(id),
  verified_at timestamptz,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_exemption_certificates_contact ON tax_exemption_certificates(contact_id);
CREATE INDEX IF NOT EXISTS idx_tax_exemption_certificates_company ON tax_exemption_certificates(company_id);
CREATE INDEX IF NOT EXISTS idx_tax_exemption_certificates_active ON tax_exemption_certificates(contact_id, is_active) WHERE is_active = true;

-- Add tax-related columns to contacts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'is_tax_exempt'
  ) THEN
    ALTER TABLE contacts ADD COLUMN is_tax_exempt boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'tax_exemption_reason'
  ) THEN
    ALTER TABLE contacts ADD COLUMN tax_exemption_reason text;
  END IF;
END $$;

-- Add tax-related columns to proposals
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'tax_environment'
  ) THEN
    ALTER TABLE proposals ADD COLUMN tax_environment text CHECK (tax_environment IN ('residential', 'commercial'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'tax_project_type'
  ) THEN
    ALTER TABLE proposals ADD COLUMN tax_project_type text CHECK (
      tax_project_type IN (
        'original_construction',
        'remodel',
        'general_installation_repair',
        'exempt_project',
        'design_services',
        'maintenance_agreement',
        'membership',
        'security_monitoring'
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'tax_jurisdiction_id'
  ) THEN
    ALTER TABLE proposals ADD COLUMN tax_jurisdiction_id uuid REFERENCES tax_jurisdictions(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'tax_rate'
  ) THEN
    ALTER TABLE proposals ADD COLUMN tax_rate decimal(5,4) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'subtotal'
  ) THEN
    ALTER TABLE proposals ADD COLUMN subtotal decimal(12,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'tax_amount'
  ) THEN
    ALTER TABLE proposals ADD COLUMN tax_amount decimal(12,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'tax_override'
  ) THEN
    ALTER TABLE proposals ADD COLUMN tax_override boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'tax_override_reason'
  ) THEN
    ALTER TABLE proposals ADD COLUMN tax_override_reason text;
  END IF;
END $$;

-- Add tax-related columns to proposal_line_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_line_items' AND column_name = 'item_type'
  ) THEN
    ALTER TABLE proposal_line_items ADD COLUMN item_type text DEFAULT 'material' CHECK (item_type IN ('labor', 'material', 'both'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_line_items' AND column_name = 'is_taxable'
  ) THEN
    ALTER TABLE proposal_line_items ADD COLUMN is_taxable boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_line_items' AND column_name = 'tax_amount'
  ) THEN
    ALTER TABLE proposal_line_items ADD COLUMN tax_amount decimal(12,2) DEFAULT 0;
  END IF;
END $$;

-- Check if invoices table exists before altering
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN
    -- Add tax-related columns to invoices
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'invoices' AND column_name = 'tax_environment'
    ) THEN
      ALTER TABLE invoices ADD COLUMN tax_environment text CHECK (tax_environment IN ('residential', 'commercial'));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'invoices' AND column_name = 'tax_project_type'
    ) THEN
      ALTER TABLE invoices ADD COLUMN tax_project_type text CHECK (
        tax_project_type IN (
          'original_construction',
          'remodel',
          'general_installation_repair',
          'exempt_project',
          'design_services',
          'maintenance_agreement',
          'membership',
          'security_monitoring'
        )
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'invoices' AND column_name = 'tax_jurisdiction_id'
    ) THEN
      ALTER TABLE invoices ADD COLUMN tax_jurisdiction_id uuid REFERENCES tax_jurisdictions(id);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'invoices' AND column_name = 'tax_rate'
    ) THEN
      ALTER TABLE invoices ADD COLUMN tax_rate decimal(5,4) DEFAULT 0;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'invoices' AND column_name = 'tax_amount'
    ) THEN
      ALTER TABLE invoices ADD COLUMN tax_amount decimal(12,2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'invoices' AND column_name = 'tax_override'
    ) THEN
      ALTER TABLE invoices ADD COLUMN tax_override boolean DEFAULT false;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'invoices' AND column_name = 'tax_override_reason'
    ) THEN
      ALTER TABLE invoices ADD COLUMN tax_override_reason text;
    END IF;
  END IF;
END $$;

-- Check if invoice_line_items table exists before altering
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoice_line_items') THEN
    -- Add tax-related columns to invoice_line_items
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'invoice_line_items' AND column_name = 'item_type'
    ) THEN
      ALTER TABLE invoice_line_items ADD COLUMN item_type text DEFAULT 'material' CHECK (item_type IN ('labor', 'material', 'both'));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'invoice_line_items' AND column_name = 'is_taxable'
    ) THEN
      ALTER TABLE invoice_line_items ADD COLUMN is_taxable boolean DEFAULT true;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'invoice_line_items' AND column_name = 'tax_amount'
    ) THEN
      ALTER TABLE invoice_line_items ADD COLUMN tax_amount decimal(12,2) DEFAULT 0;
    END IF;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE tax_jurisdictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_exemption_certificates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tax_jurisdictions
CREATE POLICY "All authenticated users can view tax jurisdictions"
  ON tax_jurisdictions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and managers can manage tax jurisdictions"
  ON tax_jurisdictions FOR ALL
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

-- RLS Policies for tax_exemption_certificates
CREATE POLICY "Users can view exemption certificates for their contacts"
  ON tax_exemption_certificates FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contacts
      WHERE contacts.id = tax_exemption_certificates.contact_id
      AND (
        contacts.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'manager')
        )
      )
    )
  );

CREATE POLICY "Users can manage exemption certificates for their contacts"
  ON tax_exemption_certificates FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contacts
      WHERE contacts.id = tax_exemption_certificates.contact_id
      AND (
        contacts.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'manager')
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contacts
      WHERE contacts.id = tax_exemption_certificates.contact_id
      AND (
        contacts.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'manager')
        )
      )
    )
  );

-- Function to get applicable tax rate
CREATE OR REPLACE FUNCTION get_applicable_tax_rate(
  p_contact_id uuid,
  p_zip_code text DEFAULT NULL
)
RETURNS decimal AS $$
DECLARE
  v_is_exempt boolean;
  v_tax_rate decimal;
BEGIN
  -- Check if contact is tax exempt with valid certificate
  SELECT c.is_tax_exempt INTO v_is_exempt
  FROM contacts c
  WHERE c.id = p_contact_id;

  IF v_is_exempt THEN
    -- Verify valid certificate exists
    IF EXISTS (
      SELECT 1 FROM tax_exemption_certificates
      WHERE contact_id = p_contact_id
      AND is_active = true
      AND (expiration_date IS NULL OR expiration_date > CURRENT_DATE)
    ) THEN
      RETURN 0;
    END IF;
  END IF;

  -- Look up tax rate by zip code
  IF p_zip_code IS NOT NULL THEN
    SELECT combined_rate INTO v_tax_rate
    FROM tax_jurisdictions
    WHERE zip_code = p_zip_code
    AND is_active = true
    AND (end_date IS NULL OR end_date > CURRENT_DATE)
    ORDER BY effective_date DESC
    LIMIT 1;

    IF v_tax_rate IS NOT NULL THEN
      RETURN v_tax_rate;
    END IF;
  END IF;

  -- Fall back to default company rate
  SELECT combined_rate INTO v_tax_rate
  FROM tax_jurisdictions
  WHERE is_default = true
  AND is_active = true
  LIMIT 1;

  RETURN COALESCE(v_tax_rate, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate line item tax based on tax rules
CREATE OR REPLACE FUNCTION calculate_line_item_tax(
  p_environment text,
  p_project_type text,
  p_item_type text,
  p_amount decimal,
  p_tax_rate decimal
)
RETURNS decimal AS $$
BEGIN
  -- Exempt project - no tax
  IF p_project_type = 'exempt_project' THEN
    RETURN 0;
  END IF;

  -- Design services - no tax (should be separate invoice)
  IF p_project_type = 'design_services' THEN
    RETURN 0;
  END IF;

  -- Security monitoring - only non-taxable on recurring (handle in application)
  -- Maintenance/Memberships - always taxable
  IF p_project_type IN ('maintenance_agreement', 'membership') THEN
    RETURN p_amount * p_tax_rate;
  END IF;

  -- Residential original construction
  IF p_environment = 'residential' AND p_project_type = 'original_construction' THEN
    IF p_item_type = 'labor' THEN
      RETURN 0; -- Labor not taxed
    ELSE
      RETURN p_amount * p_tax_rate; -- Materials taxed
    END IF;
  END IF;

  -- Residential remodel
  IF p_environment = 'residential' AND p_project_type = 'remodel' THEN
    IF p_item_type = 'labor' THEN
      RETURN 0; -- Labor not taxed
    ELSE
      RETURN p_amount * p_tax_rate; -- Materials taxed
    END IF;
  END IF;

  -- Commercial original construction
  IF p_environment = 'commercial' AND p_project_type = 'original_construction' THEN
    IF p_item_type = 'labor' THEN
      RETURN 0; -- Labor not taxed
    ELSE
      RETURN p_amount * p_tax_rate; -- Materials taxed
    END IF;
  END IF;

  -- Commercial remodel
  IF p_environment = 'commercial' AND p_project_type = 'remodel' THEN
    RETURN p_amount * p_tax_rate; -- Both labor and materials taxed
  END IF;

  -- General installation/repair (both residential and commercial)
  IF p_project_type = 'general_installation_repair' THEN
    RETURN p_amount * p_tax_rate; -- Both labor and materials taxed
  END IF;

  -- Default: apply tax
  RETURN p_amount * p_tax_rate;
END;
$$ LANGUAGE plpgsql IMMUTABLE;