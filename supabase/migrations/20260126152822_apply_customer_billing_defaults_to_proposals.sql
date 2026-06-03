/*
  # Apply Customer Billing Defaults to Proposals

  1. Updates
    - Modify create_default_proposal_settings trigger to pull billing defaults from contacts
    - Set progress_invoice_terms based on customer's default_payment_terms
    - Set acceptance_methods based on customer's accepts_po flag
    - Default to Net 10 for standard customers, Net 30 for PO customers

  2. Logic
    - If customer accepts_po = true, set acceptance_methods to include 'purchase_order' and use Net 30 terms
    - Otherwise, use standard payment method and Net 10 terms
    - Apply customer's default_payment_terms to balance_payment_terms

  3. Security
    - No RLS changes needed - inherits from existing trigger security
*/

-- Drop and recreate the function with customer billing defaults logic
CREATE OR REPLACE FUNCTION create_default_proposal_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_contract_id uuid;
  company_defaults record;
  customer_defaults record;
  default_acceptance_methods text[];
  default_progress_terms text;
  default_balance_terms text;
BEGIN
  -- Get company default contract
  SELECT id INTO default_contract_id
  FROM contracts
  WHERE contract_type = 'proposal'
    AND is_default = true
  LIMIT 1;

  -- Get company defaults from company_settings
  SELECT
    job_module_settings->>'deposit_default_percent' as default_deposit_percent,
    job_module_settings->>'project_mgmt_default_percent' as default_project_mgmt_percent,
    job_module_settings->>'system_design_default_percent' as default_system_design_percent,
    job_module_settings->>'cc_fee_default_percent' as default_cc_fee_percent,
    job_module_settings->>'misc_parts_default_percent' as default_misc_parts_percent
  INTO company_defaults
  FROM company_settings
  LIMIT 1;

  -- Get customer billing defaults from contacts
  SELECT
    default_payment_terms,
    accepts_po
  INTO customer_defaults
  FROM contacts
  WHERE id = NEW.contact_id;

  -- Determine acceptance methods based on customer preferences
  IF customer_defaults.accepts_po = true THEN
    -- Customer can use both payment and purchase orders
    default_acceptance_methods := ARRAY['payment', 'purchase_order'];
    default_progress_terms := 'net_30';  -- PO customers get Net 30
  ELSE
    -- Standard customers use payment only
    default_acceptance_methods := ARRAY['payment'];
    default_progress_terms := 'net_10';  -- Standard customers get Net 10
  END IF;

  -- Set balance payment terms based on customer's default terms
  IF customer_defaults.default_payment_terms IS NOT NULL THEN
    default_balance_terms := customer_defaults.default_payment_terms;
  ELSE
    default_balance_terms := 'Net 10';  -- System default
  END IF;

  -- Create default proposal_settings record with customer billing defaults
  INSERT INTO proposal_settings (
    proposal_id,
    contract_id,
    deposit_percent,
    project_management_percent,
    system_design_percent,
    credit_card_fee_percent,
    misc_parts_percent,
    acceptance_methods,
    progress_invoice_terms,
    balance_payment_terms
  ) VALUES (
    NEW.id,
    default_contract_id,
    COALESCE(company_defaults.default_deposit_percent::numeric, 50),
    COALESCE(company_defaults.default_project_mgmt_percent::numeric, 0),
    COALESCE(company_defaults.default_system_design_percent::numeric, 0),
    COALESCE(company_defaults.default_cc_fee_percent::numeric, 3),
    COALESCE(company_defaults.default_misc_parts_percent::numeric, 0),
    default_acceptance_methods,
    default_progress_terms,
    default_balance_terms
  );
  
  RETURN NEW;
END;
$$;

-- Recreate the trigger (it already exists, so this ensures it's using the updated function)
DROP TRIGGER IF EXISTS trigger_create_default_proposal_settings ON proposals;

CREATE TRIGGER trigger_create_default_proposal_settings
  AFTER INSERT ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION create_default_proposal_settings();

-- Add helpful comments
COMMENT ON FUNCTION create_default_proposal_settings() IS 'Creates default proposal settings when a proposal is created, pulling billing defaults from the customer contact record. PO-enabled customers get Net 30 terms and both payment methods, while standard customers get Net 10 terms and payment-only.';
