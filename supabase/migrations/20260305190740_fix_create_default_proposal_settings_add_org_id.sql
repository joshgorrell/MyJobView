/*
  # Fix create_default_proposal_settings - Add organization_id to INSERT

  ## Problem
  The create_default_proposal_settings trigger function was inserting into
  proposal_settings without including organization_id, causing a NOT NULL
  constraint violation on every new proposal creation.

  ## Fix
  Add organization_id (taken from NEW.organization_id) to the INSERT statement.
*/

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
  SELECT id INTO default_contract_id
  FROM contracts
  WHERE contract_type = 'proposal'
    AND is_default = true
  LIMIT 1;

  SELECT
    job_module_settings->>'deposit_default_percent' as default_deposit_percent,
    job_module_settings->>'project_mgmt_default_percent' as default_project_mgmt_percent,
    job_module_settings->>'system_design_default_percent' as default_system_design_percent,
    job_module_settings->>'cc_fee_default_percent' as default_cc_fee_percent,
    job_module_settings->>'misc_parts_default_percent' as default_misc_parts_percent
  INTO company_defaults
  FROM company_settings
  LIMIT 1;

  SELECT
    default_payment_terms,
    accepts_po
  INTO customer_defaults
  FROM contacts
  WHERE id = NEW.contact_id;

  IF customer_defaults.accepts_po = true THEN
    default_acceptance_methods := ARRAY['payment', 'purchase_order'];
    default_progress_terms := 'net_30';
  ELSE
    default_acceptance_methods := ARRAY['payment'];
    default_progress_terms := 'net_10';
  END IF;

  IF customer_defaults.default_payment_terms IS NOT NULL THEN
    default_balance_terms := customer_defaults.default_payment_terms;
  ELSE
    default_balance_terms := 'Net 10';
  END IF;

  INSERT INTO proposal_settings (
    proposal_id,
    organization_id,
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
    NEW.organization_id,
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
