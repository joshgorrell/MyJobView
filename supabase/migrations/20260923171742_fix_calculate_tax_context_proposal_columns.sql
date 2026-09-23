-- Fix calculate_tax_context: proposal branch references non-existent columns
-- design_fee_total → project_design_amount
-- project_management_total → project_management_amount
-- freight_total → no freight column on proposals, default to 0
-- credit_card_fee_total → credit_card_fee_amount

CREATE OR REPLACE FUNCTION calculate_tax_context(
  p_transaction_type text,
  p_transaction_id uuid
) RETURNS jsonb
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
    SELECT COALESCE(project_design_amount, 0), COALESCE(project_management_amount, 0), 0
    INTO v_design_fee_amount, v_pm_amount, v_freight_amount
    FROM proposals WHERE id = p_transaction_id;

    -- CCF from proposal-level field
    SELECT COALESCE(credit_card_fee_amount, 0) INTO v_ccf_amount
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
