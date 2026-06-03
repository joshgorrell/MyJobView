/*
  # Create Proposal Settings and Contract Management System

  1. New Tables
    - `contracts`
      - `id` (uuid, primary key)
      - `company_id` (uuid, references auth.users)
      - `name` (text) - Contract name/title
      - `content` (text) - Full contract text/HTML
      - `is_default` (boolean) - Whether this is the default contract
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `proposal_area_templates`
      - `id` (uuid, primary key)
      - `company_id` (uuid, references auth.users)
      - `name` (text) - Area/room name
      - `sort_order` (integer)
      - `created_at` (timestamptz)
    
    - `proposal_settings`
      - `id` (uuid, primary key)
      - `proposal_id` (uuid, references proposals)
      - `contract_id` (uuid, references contracts, nullable)
      - Payment Terms
        - `payment_terms_type` (text) - 'percentage' or 'fixed'
        - `deposit_percent` (numeric) - Default deposit percentage
        - `deposit_amount` (numeric) - Fixed deposit amount
        - `payment_schedule` (jsonb) - Array of payment milestones
      - Modifiers
        - `project_management_percent` (numeric, default 0)
        - `system_design_percent` (numeric, default 0)
        - `credit_card_fee_percent` (numeric, default 0)
        - `misc_parts_percent` (numeric, default 0)
      - Area Configuration
        - `selected_areas` (jsonb) - Array of area names for this proposal
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Company Settings Enhancement
    - Add default proposal settings to company_settings table

  3. Security
    - Enable RLS on all tables
    - Policies for authenticated users based on company_id
*/

-- Contracts table
CREATE TABLE IF NOT EXISTS contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  content text NOT NULL DEFAULT '',
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view contracts from their company"
  ON contracts FOR SELECT
  TO authenticated
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Admins can insert contracts"
  ON contracts FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can update contracts"
  ON contracts FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can delete contracts"
  ON contracts FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Proposal area templates table
CREATE TABLE IF NOT EXISTS proposal_area_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE proposal_area_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view area templates from their company"
  ON proposal_area_templates FOR SELECT
  TO authenticated
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Sales users can manage area templates"
  ON proposal_area_templates FOR ALL
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin', 'sales_manager', 'sales_rep')
    )
  );

-- Proposal settings table
CREATE TABLE IF NOT EXISTS proposal_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES proposals(id) ON DELETE CASCADE NOT NULL UNIQUE,
  contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL,
  
  payment_terms_type text DEFAULT 'percentage' CHECK (payment_terms_type IN ('percentage', 'fixed')),
  deposit_percent numeric DEFAULT 50,
  deposit_amount numeric DEFAULT 0,
  payment_schedule jsonb DEFAULT '[]'::jsonb,
  
  project_management_percent numeric DEFAULT 0,
  system_design_percent numeric DEFAULT 0,
  credit_card_fee_percent numeric DEFAULT 0,
  misc_parts_percent numeric DEFAULT 0,
  
  selected_areas jsonb DEFAULT '[]'::jsonb,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE proposal_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view proposal settings from their company"
  ON proposal_settings FOR SELECT
  TO authenticated
  USING (
    proposal_id IN (
      SELECT id FROM proposals
      WHERE company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Sales users can manage proposal settings"
  ON proposal_settings FOR ALL
  TO authenticated
  USING (
    proposal_id IN (
      SELECT id FROM proposals
      WHERE company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin', 'sales_manager', 'sales_rep')
    )
  );

-- Add default proposal settings to company_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' 
    AND column_name = 'default_deposit_percent'
  ) THEN
    ALTER TABLE company_settings
    ADD COLUMN default_deposit_percent numeric DEFAULT 50,
    ADD COLUMN default_project_mgmt_percent numeric DEFAULT 0,
    ADD COLUMN default_system_design_percent numeric DEFAULT 0,
    ADD COLUMN default_cc_fee_percent numeric DEFAULT 3,
    ADD COLUMN default_misc_parts_percent numeric DEFAULT 0;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_contracts_company_id ON contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_contracts_is_default ON contracts(is_default) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_proposal_area_templates_company_id ON proposal_area_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_proposal_settings_proposal_id ON proposal_settings(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_settings_contract_id ON proposal_settings(contract_id);

-- Trigger to ensure only one default contract per company
CREATE OR REPLACE FUNCTION ensure_single_default_contract()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE contracts
    SET is_default = false
    WHERE company_id = NEW.company_id
      AND id != NEW.id
      AND is_default = true;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_ensure_single_default_contract ON contracts;

CREATE TRIGGER trigger_ensure_single_default_contract
  BEFORE INSERT OR UPDATE ON contracts
  FOR EACH ROW
  WHEN (NEW.is_default = true)
  EXECUTE FUNCTION ensure_single_default_contract();

-- Function to create default proposal settings when proposal is created
CREATE OR REPLACE FUNCTION create_default_proposal_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  default_contract_id uuid;
  company_defaults record;
BEGIN
  SELECT id INTO default_contract_id
  FROM contracts
  WHERE company_id = NEW.company_id
    AND is_default = true
  LIMIT 1;
  
  SELECT 
    default_deposit_percent,
    default_project_mgmt_percent,
    default_system_design_percent,
    default_cc_fee_percent,
    default_misc_parts_percent
  INTO company_defaults
  FROM company_settings
  WHERE id = NEW.company_id;
  
  INSERT INTO proposal_settings (
    proposal_id,
    contract_id,
    deposit_percent,
    project_management_percent,
    system_design_percent,
    credit_card_fee_percent,
    misc_parts_percent
  ) VALUES (
    NEW.id,
    default_contract_id,
    COALESCE(company_defaults.default_deposit_percent, 50),
    COALESCE(company_defaults.default_project_mgmt_percent, 0),
    COALESCE(company_defaults.default_system_design_percent, 0),
    COALESCE(company_defaults.default_cc_fee_percent, 3),
    COALESCE(company_defaults.default_misc_parts_percent, 0)
  );
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_create_default_proposal_settings ON proposals;

CREATE TRIGGER trigger_create_default_proposal_settings
  AFTER INSERT ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION create_default_proposal_settings();
