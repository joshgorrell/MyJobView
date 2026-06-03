/*
  # Add Proposal Readiness Validation Tracking

  1. Changes to Tables
    - Add validation tracking columns to `proposal_settings`
      - `details_reviewed_at` - When Details tab was last reviewed
      - `scope_reviewed_at` - When Scope of Work tab was last reviewed
      - `contract_reviewed_at` - When Contract tab was last reviewed
      - `billing_reviewed_at` - When Billing tab was last reviewed
      - `tax_reviewed_at` - When Tax tab was last reviewed
      - `fees_reviewed_at` - When Fees & Modifiers tab was last reviewed
      - `is_ready_to_send` - Computed boolean indicating proposal readiness

  2. Functions
    - `calculate_proposal_readiness` - Determines if proposal is ready to send
    - `mark_settings_section_reviewed` - Helper to mark a section as reviewed

  3. Triggers
    - Auto-update `is_ready_to_send` when settings change

  4. Notes
    - Existing proposals will have all sections marked as reviewed on first update
    - Validation ensures all required fields are present before allowing send
*/

-- Add validation tracking columns to proposal_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_settings' AND column_name = 'details_reviewed_at'
  ) THEN
    ALTER TABLE proposal_settings
      ADD COLUMN details_reviewed_at timestamptz,
      ADD COLUMN scope_reviewed_at timestamptz,
      ADD COLUMN contract_reviewed_at timestamptz,
      ADD COLUMN billing_reviewed_at timestamptz,
      ADD COLUMN tax_reviewed_at timestamptz,
      ADD COLUMN fees_reviewed_at timestamptz,
      ADD COLUMN is_ready_to_send boolean DEFAULT false;
  END IF;
END $$;

-- Create function to calculate proposal readiness
CREATE OR REPLACE FUNCTION calculate_proposal_readiness(proposal_id_input uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal proposals%ROWTYPE;
  v_settings proposal_settings%ROWTYPE;
  v_has_line_items boolean;
  v_is_ready boolean := false;
BEGIN
  -- Get proposal and settings
  SELECT * INTO v_proposal FROM proposals WHERE id = proposal_id_input;
  SELECT * INTO v_settings FROM proposal_settings WHERE proposal_id = proposal_id_input;

  IF v_proposal IS NULL THEN
    RETURN false;
  END IF;

  -- Check if proposal has line items
  SELECT EXISTS(
    SELECT 1 FROM proposal_line_items WHERE proposal_id = proposal_id_input
  ) INTO v_has_line_items;

  -- Calculate readiness based on required criteria
  v_is_ready := (
    -- Details validation: Has title and contact
    v_proposal.title IS NOT NULL AND
    v_proposal.title != '' AND
    v_proposal.contact_id IS NOT NULL AND

    -- Must have line items
    v_has_line_items AND

    -- Settings must exist
    v_settings IS NOT NULL AND

    -- Contract validation: Has contract selected
    v_settings.contract_id IS NOT NULL AND

    -- Billing validation: Has deposit configuration
    v_settings.require_deposit IS NOT NULL AND
    v_settings.deposit_type IS NOT NULL AND

    -- Tax validation: Has tax environment
    v_proposal.tax_environment IS NOT NULL AND
    v_proposal.tax_project_type IS NOT NULL AND

    -- All sections have been reviewed at least once
    v_settings.details_reviewed_at IS NOT NULL AND
    v_settings.scope_reviewed_at IS NOT NULL AND
    v_settings.contract_reviewed_at IS NOT NULL AND
    v_settings.billing_reviewed_at IS NOT NULL AND
    v_settings.tax_reviewed_at IS NOT NULL AND
    v_settings.fees_reviewed_at IS NOT NULL
  );

  RETURN v_is_ready;
END;
$$;

-- Create helper function to mark section as reviewed
CREATE OR REPLACE FUNCTION mark_settings_section_reviewed(
  proposal_id_input uuid,
  section_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_column_name text;
  v_sql text;
BEGIN
  -- Validate section name and map to column
  v_column_name := CASE section_name
    WHEN 'details' THEN 'details_reviewed_at'
    WHEN 'scope' THEN 'scope_reviewed_at'
    WHEN 'contract' THEN 'contract_reviewed_at'
    WHEN 'billing' THEN 'billing_reviewed_at'
    WHEN 'tax' THEN 'tax_reviewed_at'
    WHEN 'fees' THEN 'fees_reviewed_at'
    ELSE NULL
  END;

  IF v_column_name IS NULL THEN
    RAISE EXCEPTION 'Invalid section name: %', section_name;
  END IF;

  -- Update the specific column
  v_sql := format(
    'UPDATE proposal_settings SET %I = now(), updated_at = now() WHERE proposal_id = $1',
    v_column_name
  );

  EXECUTE v_sql USING proposal_id_input;
END;
$$;

-- Create trigger to auto-update is_ready_to_send
CREATE OR REPLACE FUNCTION update_proposal_readiness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update the is_ready_to_send flag
  NEW.is_ready_to_send := calculate_proposal_readiness(NEW.proposal_id);
  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_update_proposal_readiness ON proposal_settings;
CREATE TRIGGER trigger_update_proposal_readiness
  BEFORE INSERT OR UPDATE ON proposal_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_proposal_readiness();

-- Also update when proposals table changes (title, contact, tax fields)
CREATE OR REPLACE FUNCTION update_proposal_settings_readiness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update the settings is_ready_to_send flag
  UPDATE proposal_settings
  SET is_ready_to_send = calculate_proposal_readiness(NEW.id),
      updated_at = now()
  WHERE proposal_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_proposal_settings_readiness ON proposals;
CREATE TRIGGER trigger_update_proposal_settings_readiness
  AFTER INSERT OR UPDATE OF title, contact_id, tax_environment, tax_project_type ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION update_proposal_settings_readiness();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_proposal_readiness(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_settings_section_reviewed(uuid, text) TO authenticated;

-- Mark existing proposals as having all sections reviewed (backwards compatibility)
UPDATE proposal_settings
SET
  details_reviewed_at = COALESCE(details_reviewed_at, created_at),
  scope_reviewed_at = COALESCE(scope_reviewed_at, created_at),
  contract_reviewed_at = COALESCE(contract_reviewed_at, created_at),
  billing_reviewed_at = COALESCE(billing_reviewed_at, created_at),
  tax_reviewed_at = COALESCE(tax_reviewed_at, created_at),
  fees_reviewed_at = COALESCE(fees_reviewed_at, created_at)
WHERE
  details_reviewed_at IS NULL OR
  scope_reviewed_at IS NULL OR
  contract_reviewed_at IS NULL OR
  billing_reviewed_at IS NULL OR
  tax_reviewed_at IS NULL OR
  fees_reviewed_at IS NULL;

-- Update all existing proposal readiness flags
UPDATE proposal_settings ps
SET is_ready_to_send = calculate_proposal_readiness(ps.proposal_id);
