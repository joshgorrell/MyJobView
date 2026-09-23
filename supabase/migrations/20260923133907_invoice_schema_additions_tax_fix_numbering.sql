/*
# Invoice Schema Additions, Tax-Context Fix, and Numbering Infrastructure

## Summary
This migration makes additive schema changes, fixes the invoice tax-context calculation bug,
implements concurrency-safe invoice numbering, adds a finance-visibility helper function,
and cleans up the test INV-00001 draft. All changes are safe to deploy independently
before the coordinated sent→submitted cutover.

## Changes

### 1. New Columns on `invoices` table
- `portal_visible` (boolean, NOT NULL, DEFAULT false) — controls per-invoice Customer Portal visibility
- `jobsite_address` (text, nullable) — standalone invoice transaction-location street address
- `jobsite_city` (text, nullable) — standalone invoice transaction-location city
- `jobsite_state` (text, nullable) — standalone invoice transaction-location state
- `jobsite_zip` (text, nullable) — standalone invoice transaction-location zip

### 2. Invoice Numbering Infrastructure
- Creates `invoice_number_seq` sequence, initialized from the highest existing numeric invoice number suffix
- Replaces `generate_invoice_number()` to use `nextval('invoice_number_seq')` instead of MAX+1 (concurrency-safe)
- Modifies `auto_set_invoice_number()` trigger function to skip number assignment for drafts
- Creates new `assign_invoice_number_on_submit()` trigger function that assigns a number
  when status transitions from draft to a non-draft status
- Drops and recreates `trg_auto_set_invoice_number` trigger
- Creates new `trg_assign_invoice_number_on_submit` BEFORE UPDATE trigger

### 3. Tax-Context Bug Fix in `calculate_tax_context()`
- Fixes invoice branch: reads tax_environment, tax_project_type, tax_rate, and jobsite address
  from the invoices table directly (with fallback to proposal JOIN only when proposal_id is not NULL)
- Fixes invoice branch: uses `ili.amount` instead of non-existent `ili.line_total` in all 6 SUM queries
  (material, labor, design_fee, project_management, freight_delivery, credit_card_fee)

### 4. Finance Visibility Helper
- Creates `can_view_all_org_invoices()` SECURITY DEFINER function that returns true for
  roles admin, manager, service_manager, and finance — without modifying is_manager()

### 5. Test Data Cleanup
- Deletes the INV-00001 test draft invoice and its line items (identified as test data:
  only 1 invoice in the system, status=draft, source_type=progress, no payments, no notifications)

### Important Notes
- This migration does NOT change the status constraint or any status references
- The sent→submitted cutover happens in a separate coordinated migration
- Drafts no longer consume invoice numbers (trigger skips drafts)
- The sequence is initialized dynamically from existing data
- All changes are idempotent (uses IF NOT EXISTS, DROP IF EXISTS)
*/

-- ============================================================
-- 1. Add new columns to invoices
-- ============================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS portal_visible boolean NOT NULL DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS jobsite_address text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS jobsite_city text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS jobsite_state text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS jobsite_zip text;

-- ============================================================
-- 2. Invoice Numbering Infrastructure
-- ============================================================

-- Create sequence initialized from highest existing numeric invoice number suffix
DO $$
DECLARE
  v_max_num bigint;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS bigint)), 0)
  INTO v_max_num
  FROM invoices
  WHERE invoice_number ~ '[0-9]+$';

  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE sequencename = 'invoice_number_seq') THEN
    CREATE SEQUENCE invoice_number_seq AS bigint START WITH 1;
  END IF;

  PERFORM setval('invoice_number_seq', GREATEST(v_max_num, 1), v_max_num > 0);
END $$;

-- Replace generate_invoice_number to use the sequence (concurrency-safe)
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_num bigint;
BEGIN
  v_next_num := nextval('invoice_number_seq');
  RETURN 'INV-' || LPAD(v_next_num::text, 5, '0');
END;
$$;

-- Modify auto_set_invoice_number to skip drafts
CREATE OR REPLACE FUNCTION auto_set_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only assign a number for non-draft invoices that don't have one
  IF NEW.status <> 'draft' AND (NEW.invoice_number IS NULL OR NEW.invoice_number = '') THEN
    NEW.invoice_number := generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$;

-- New trigger function: assign invoice number when transitioning from draft to submitted
CREATE OR REPLACE FUNCTION assign_invoice_number_on_submit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When transitioning from draft to a non-draft status, assign a number if missing
  IF NEW.status <> 'draft' AND COALESCE(OLD.status, 'draft') = 'draft'
     AND (NEW.invoice_number IS NULL OR NEW.invoice_number = '') THEN
    NEW.invoice_number := generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$;

-- Drop and recreate the BEFORE INSERT trigger
DROP TRIGGER IF EXISTS trg_auto_set_invoice_number ON invoices;
CREATE TRIGGER trg_auto_set_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_invoice_number();

-- Create new BEFORE UPDATE trigger for number assignment on submit
DROP TRIGGER IF EXISTS trg_assign_invoice_number_on_submit ON invoices;
CREATE TRIGGER trg_assign_invoice_number_on_submit
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION assign_invoice_number_on_submit();

-- ============================================================
-- 3. Fix calculate_tax_context() invoice branch
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_tax_context(p_transaction_type text, p_transaction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_office_id uuid;
  v_contact_id uuid;
  v_state text;
  v_environment text;
  v_project_type text;
  v_tax_rate numeric;
  v_jobsite_street text;
  v_jobsite_city text;
  v_jobsite_state text;
  v_jobsite_zip text;

  v_material_taxability jsonb;
  v_labor_taxability jsonb;
  v_freight_taxability jsonb;
  v_design_fee_taxability jsonb;
  v_pm_taxability jsonb;
  v_ccf_taxability jsonb;
  v_taxability_results jsonb;
  v_origin_result jsonb;
  v_collection_status text;
  v_nexus_status text;
  v_destination_result jsonb;
  v_is_exempt boolean := false;
  v_exemption_ref text;

  v_tax_calculation_status text;
  v_review_reasons jsonb[] := ARRAY[]::jsonb[];

  v_material_amount numeric := 0;
  v_labor_amount numeric := 0;
  v_freight_amount numeric := 0;
  v_design_fee_amount numeric := 0;
  v_pm_amount numeric := 0;
  v_ccf_amount numeric := 0;
  v_taxable_subtotal numeric := 0;
  v_tax_amount numeric := 0;

  v_freight_sc_id uuid;
  v_cm1_sc_id uuid;
  v_cm2_sc_id uuid;
  v_cm1_amount numeric;
  v_cm2_amount numeric;
  v_cm1_apply boolean;
  v_cm2_apply boolean;

  v_classification_id uuid;
  v_classification_code text;
  v_line_amount numeric;
BEGIN
  -- 1. Load the transaction record
  IF p_transaction_type = 'proposal' THEN
    SELECT organization_id, office_id, contact_id, tax_environment, tax_project_type,
           tax_rate, jobsite_address, jobsite_city, jobsite_state, jobsite_zip
    INTO v_org_id, v_office_id, v_contact_id, v_environment, v_project_type,
         v_tax_rate, v_jobsite_street, v_jobsite_city, v_jobsite_state, v_jobsite_zip
    FROM proposals WHERE id = p_transaction_id;

    IF v_org_id IS NULL THEN
      RETURN jsonb_build_object('error', 'Proposal not found');
    END IF;

    -- Material: sum parts_total (covers all material-classified line items)
    SELECT parts_total, labor_total INTO v_material_amount, v_labor_amount
    FROM proposals WHERE id = p_transaction_id;

    -- Design fee, PM, freight from proposal-level fields
    SELECT COALESCE(design_fee_total, 0), COALESCE(project_management_total, 0), COALESCE(freight_total, 0)
    INTO v_design_fee_amount, v_pm_amount, v_freight_amount
    FROM proposals WHERE id = p_transaction_id;

    -- CCF from proposal-level field
    SELECT COALESCE(credit_card_fee_total, 0) INTO v_ccf_amount
    FROM proposals WHERE id = p_transaction_id;

  ELSIF p_transaction_type = 'change_order' THEN
    SELECT organization_id, office_id, contact_id, tax_environment, tax_project_type,
           tax_rate
    INTO v_org_id, v_office_id, v_contact_id, v_environment, v_project_type,
         v_tax_rate
    FROM change_orders WHERE id = p_transaction_id;

    IF v_org_id IS NULL THEN
      RETURN jsonb_build_object('error', 'Change order not found');
    END IF;

    -- Get jobsite address from parent proposal
    SELECT p.jobsite_address, p.jobsite_city, p.jobsite_state, p.jobsite_zip
    INTO v_jobsite_street, v_jobsite_city, v_jobsite_state, v_jobsite_zip
    FROM proposals p
    JOIN change_orders co ON co.proposal_id = p.id
    WHERE co.id = p_transaction_id;

    -- Amounts from change order line items grouped by classification
    SELECT COALESCE(SUM(
      CASE WHEN COALESCE(tc.code,
        CASE WHEN COALESCE(coli.item_type, 'material') = 'labor' THEN 'labor'
             ELSE 'material' END) = 'material'
      THEN coli.amount ELSE 0 END
    ), 0)
    INTO v_material_amount
    FROM change_order_line_items coli
    LEFT JOIN tax_classifications tc ON tc.id = coli.tax_classification_id
    WHERE coli.change_order_id = p_transaction_id;

    SELECT COALESCE(SUM(
      CASE WHEN COALESCE(tc.code,
        CASE WHEN COALESCE(coli.item_type, 'material') = 'labor' THEN 'labor'
             ELSE 'material' END) = 'labor'
      THEN coli.amount ELSE 0 END
    ), 0)
    INTO v_labor_amount
    FROM change_order_line_items coli
    LEFT JOIN tax_classifications tc ON tc.id = coli.tax_classification_id
    WHERE coli.change_order_id = p_transaction_id;

    SELECT COALESCE(SUM(CASE WHEN tc.code = 'design_fee' THEN coli.amount ELSE 0 END), 0)
    INTO v_design_fee_amount
    FROM change_order_line_items coli
    LEFT JOIN tax_classifications tc ON tc.id = coli.tax_classification_id
    WHERE coli.change_order_id = p_transaction_id;

    SELECT COALESCE(SUM(CASE WHEN tc.code = 'project_management' THEN coli.amount ELSE 0 END), 0)
    INTO v_pm_amount
    FROM change_order_line_items coli
    LEFT JOIN tax_classifications tc ON tc.id = coli.tax_classification_id
    WHERE coli.change_order_id = p_transaction_id;

    SELECT COALESCE(SUM(CASE WHEN tc.code = 'freight_delivery' THEN coli.amount ELSE 0 END), 0)
    INTO v_freight_amount
    FROM change_order_line_items coli
    LEFT JOIN tax_classifications tc ON tc.id = coli.tax_classification_id
    WHERE coli.change_order_id = p_transaction_id;

    SELECT COALESCE(SUM(CASE WHEN tc.code = 'credit_card_fee' THEN coli.amount ELSE 0 END), 0)
    INTO v_ccf_amount
    FROM change_order_line_items coli
    LEFT JOIN tax_classifications tc ON tc.id = coli.tax_classification_id
    WHERE coli.change_order_id = p_transaction_id;

  ELSIF p_transaction_type = 'invoice' THEN
    -- Load tax context from the invoices table directly
    SELECT organization_id, office_id, contact_id, tax_environment, tax_project_type,
           tax_rate, jobsite_address, jobsite_city, jobsite_state, jobsite_zip
    INTO v_org_id, v_office_id, v_contact_id, v_environment, v_project_type,
         v_tax_rate, v_jobsite_street, v_jobsite_city, v_jobsite_state, v_jobsite_zip
    FROM invoices WHERE id = p_transaction_id;

    IF v_org_id IS NULL THEN
      RETURN jsonb_build_object('error', 'Invoice not found');
    END IF;

    -- If invoice's own tax fields are NULL, fall back to proposal JOIN (backward compat)
    IF v_environment IS NULL AND v_jobsite_state IS NULL THEN
      SELECT p.tax_environment, p.tax_project_type, p.tax_rate,
             p.jobsite_address, p.jobsite_city, p.jobsite_state, p.jobsite_zip
      INTO v_environment, v_project_type, v_tax_rate,
           v_jobsite_street, v_jobsite_city, v_jobsite_state, v_jobsite_zip
      FROM proposals p
      JOIN invoices inv ON inv.proposal_id = p.id
      WHERE inv.id = p_transaction_id
      LIMIT 1;
    END IF;

    -- Group invoice line items by tax_classification_id, fall back to item_type
    -- FIX: use ili.amount (not ili.line_total which does not exist)
    SELECT COALESCE(SUM(
      CASE WHEN COALESCE(tc.code,
        CASE WHEN COALESCE(ili.item_type, 'material') = 'labor' THEN 'labor'
             ELSE 'material' END) = 'material'
      THEN ili.amount ELSE 0 END
    ), 0)
    INTO v_material_amount
    FROM invoice_line_items ili
    LEFT JOIN tax_classifications tc ON tc.id = ili.tax_classification_id
    WHERE ili.invoice_id = p_transaction_id;

    SELECT COALESCE(SUM(
      CASE WHEN COALESCE(tc.code,
        CASE WHEN COALESCE(ili.item_type, 'material') = 'labor' THEN 'labor'
             ELSE 'material' END) = 'labor'
      THEN ili.amount ELSE 0 END
    ), 0)
    INTO v_labor_amount
    FROM invoice_line_items ili
    LEFT JOIN tax_classifications tc ON tc.id = ili.tax_classification_id
    WHERE ili.invoice_id = p_transaction_id;

    SELECT COALESCE(SUM(CASE WHEN tc.code = 'design_fee' THEN ili.amount ELSE 0 END), 0)
    INTO v_design_fee_amount
    FROM invoice_line_items ili
    LEFT JOIN tax_classifications tc ON tc.id = ili.tax_classification_id
    WHERE ili.invoice_id = p_transaction_id;

    SELECT COALESCE(SUM(CASE WHEN tc.code = 'project_management' THEN ili.amount ELSE 0 END), 0)
    INTO v_pm_amount
    FROM invoice_line_items ili
    LEFT JOIN tax_classifications tc ON tc.id = ili.tax_classification_id
    WHERE ili.invoice_id = p_transaction_id;

    SELECT COALESCE(SUM(CASE WHEN tc.code = 'freight_delivery' THEN ili.amount ELSE 0 END), 0)
    INTO v_freight_amount
    FROM invoice_line_items ili
    LEFT JOIN tax_classifications tc ON tc.id = ili.tax_classification_id
    WHERE ili.invoice_id = p_transaction_id;

    -- Invoice branch: CCF amount IS read from line items (payment events may create CCF lines)
    SELECT COALESCE(SUM(CASE WHEN tc.code = 'credit_card_fee' THEN ili.amount ELSE 0 END), 0)
    INTO v_ccf_amount
    FROM invoice_line_items ili
    LEFT JOIN tax_classifications tc ON tc.id = ili.tax_classification_id
    WHERE ili.invoice_id = p_transaction_id;

  ELSE
    RETURN jsonb_build_object('error', 'Unknown transaction type: ' || p_transaction_type);
  END IF;

  v_state := COALESCE(v_jobsite_state, '');
  v_tax_rate := COALESCE(v_tax_rate, 0);
  v_environment := COALESCE(v_environment, 'residential');
  v_project_type := COALESCE(v_project_type, 'general_installation_repair');

  -- 2. Resolve origin address
  v_origin_result := resolve_tax_origin_address(v_org_id, v_office_id);
  IF (v_origin_result->>'review_required')::boolean THEN
    v_review_reasons := array_append(v_review_reasons,
      jsonb_build_object('layer', 'origin', 'reason', v_origin_result->>'review_reason'));
  END IF;

  -- 3. Resolve taxability for all 6 classifications (CCF remains a valid classification)
  v_material_taxability := resolve_tax_rule(v_state, v_org_id, v_environment, v_project_type, 'material');
  v_labor_taxability := resolve_tax_rule(v_state, v_org_id, v_environment, v_project_type, 'labor');
  v_freight_taxability := resolve_tax_rule(v_state, v_org_id, v_environment, v_project_type, 'freight_delivery');
  v_design_fee_taxability := resolve_tax_rule(v_state, v_org_id, v_environment, v_project_type, 'design_fee');
  v_pm_taxability := resolve_tax_rule(v_state, v_org_id, v_environment, v_project_type, 'project_management');
  v_ccf_taxability := resolve_tax_rule(v_state, v_org_id, v_environment, v_project_type, 'credit_card_fee');

  v_taxability_results := jsonb_build_object(
    'material', v_material_taxability,
    'labor', v_labor_taxability,
    'freight_delivery', v_freight_taxability,
    'design_fee', v_design_fee_taxability,
    'project_management', v_pm_taxability,
    'credit_card_fee', v_ccf_taxability
  );

  -- Flag needs_review only for classifications with non-zero amount ($0 rule)
  IF v_material_amount > 0 AND v_material_taxability->>'taxability_status' = 'needs_review' THEN
    v_review_reasons := array_append(v_review_reasons,
      jsonb_build_object('layer', 'taxability', 'classification', 'material', 'reason', v_material_taxability->>'explanation'));
  END IF;
  IF v_labor_amount > 0 AND v_labor_taxability->>'taxability_status' = 'needs_review' THEN
    v_review_reasons := array_append(v_review_reasons,
      jsonb_build_object('layer', 'taxability', 'classification', 'labor', 'reason', v_labor_taxability->>'explanation'));
  END IF;
  IF v_freight_amount > 0 AND v_freight_taxability->>'taxability_status' = 'needs_review' THEN
    v_review_reasons := array_append(v_review_reasons,
      jsonb_build_object('layer', 'taxability', 'classification', 'freight_delivery', 'reason', v_freight_taxability->>'explanation'));
  END IF;
  IF v_design_fee_amount > 0 AND v_design_fee_taxability->>'taxability_status' = 'needs_review' THEN
    v_review_reasons := array_append(v_review_reasons,
      jsonb_build_object('layer', 'taxability', 'classification', 'design_fee', 'reason', v_design_fee_taxability->>'explanation'));
  END IF;
  IF v_pm_amount > 0 AND v_pm_taxability->>'taxability_status' = 'needs_review' THEN
    v_review_reasons := array_append(v_review_reasons,
      jsonb_build_object('layer', 'taxability', 'classification', 'project_management', 'reason', v_pm_taxability->>'explanation'));
  END IF;
  IF v_ccf_amount > 0 AND v_ccf_taxability->>'taxability_status' = 'needs_review' THEN
    v_review_reasons := array_append(v_review_reasons,
      jsonb_build_object('layer', 'taxability', 'classification', 'credit_card_fee', 'reason', v_ccf_taxability->>'explanation'));
  END IF;

  -- 4. Resolve destination / nexus
  v_destination_result := resolve_tax_destination(v_state, v_org_id, v_contact_id);
  IF (v_destination_result->>'review_required')::boolean THEN
    v_review_reasons := array_append(v_review_reasons,
      jsonb_build_object('layer', 'destination', 'reason', v_destination_result->>'review_reason'));
  END IF;

  v_collection_status := v_destination_result->>'collection_status';
  v_nexus_status := v_destination_result->>'nexus_status';

  -- 5. Resolve exemption
  v_is_exempt := false;
  v_exemption_ref := null;
  IF v_contact_id IS NOT NULL THEN
    SELECT exemption_reference INTO v_exemption_ref
    FROM resolve_tax_exemption(v_contact_id, v_state, v_environment, v_project_type);
    IF v_exemption_ref IS NOT NULL THEN
      v_is_exempt := true;
    END IF;
  END IF;

  -- 6. Compute tax amount
  v_taxable_subtotal := v_material_amount + v_labor_amount + v_freight_amount
                         + v_design_fee_amount + v_pm_amount + v_ccf_amount;

  IF v_is_exempt THEN
    v_tax_amount := 0;
  ELSIF v_collection_status = 'collecting' THEN
    v_tax_amount := round(v_taxable_subtotal * v_tax_rate / 100, 2);
  ELSE
    v_tax_amount := 0;
  END IF;

  -- 7. Determine calculation status
  IF array_length(v_review_reasons, 1) IS NOT NULL THEN
    v_tax_calculation_status := 'review_required';
  ELSIF v_is_exempt THEN
    v_tax_calculation_status := 'exempt';
  ELSIF v_collection_status = 'not_collecting' THEN
    v_tax_calculation_status := 'not_collecting';
  ELSE
    v_tax_calculation_status := 'ready';
  END IF;

  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'office_id', v_office_id,
    'contact_id', v_contact_id,
    'state', v_state,
    'environment', v_environment,
    'project_type', v_project_type,
    'tax_rate', v_tax_rate,
    'jobsite_address', v_jobsite_street,
    'jobsite_city', v_jobsite_city,
    'jobsite_state', v_jobsite_state,
    'jobsite_zip', v_jobsite_zip,
    'material_amount', v_material_amount,
    'labor_amount', v_labor_amount,
    'freight_amount', v_freight_amount,
    'design_fee_amount', v_design_fee_amount,
    'pm_amount', v_pm_amount,
    'ccf_amount', v_ccf_amount,
    'taxable_subtotal', v_taxable_subtotal,
    'tax_amount', v_tax_amount,
    'taxability_results', v_taxability_results,
    'origin_result', v_origin_result,
    'destination_result', v_destination_result,
    'collection_status', v_collection_status,
    'nexus_status', v_nexus_status,
    'is_exempt', v_is_exempt,
    'exemption_reference', v_exemption_ref,
    'tax_calculation_status', v_tax_calculation_status,
    'review_reasons', to_jsonb(v_review_reasons)
  );
END;
$$;

-- ============================================================
-- 4. Finance visibility helper function
-- ============================================================

CREATE OR REPLACE FUNCTION can_view_all_org_invoices()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'manager', 'service_manager', 'finance')
  );
$$;

-- ============================================================
-- 5. Clean up INV-00001 test draft
-- ============================================================

-- Delete the test draft invoice's line items first (FK safety)
DELETE FROM invoice_line_items
WHERE invoice_id = '223f03fe-8ee0-4eac-97c7-bb54b2fddf0d';

-- Delete the test draft invoice itself
DELETE FROM invoices
WHERE id = '223f03fe-8ee0-4eac-97c7-bb54b2fddf0d'
  AND invoice_number = 'INV-00001'
  AND status = 'draft';
