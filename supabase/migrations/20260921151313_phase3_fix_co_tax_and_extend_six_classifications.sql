/*
# Fix Change Order Tax Engine and Extend to Six Classifications

## Purpose
1. Fix confirmed bug: Change Order labor was hardcoded to $0 in calculate_tax_context
   while all change_amount (including labor items) was counted as Material.
2. Extend calculate_tax_context to resolve all 6 classifications for proposals,
   change orders, and invoices.
3. Implement the $0 rule: a classification with $0 amount does not block the
   transaction even if its taxability rule is needs_review.

## Changes to calculate_tax_context

### Change Order branch fixes:
- Material: exclude labor items (item_type = 'labor') from the material sum
- Labor: sum COALESCE(labor_total, change_amount) from items where item_type = 'labor
  (replaces hardcoded v_labor_amount := 0)
- No double-counting: a line item is either material or labor, never both

### Six-classification resolution (all transaction types):
- Add amount variables for design_fee, project_management, credit_card_fee
- Read amounts from proposals/change_orders fields:
  - project_design_amount + system_design_amount = design_fee
  - project_management_amount = project_management
  - credit_card_fee_amount = credit_card_fee
- Resolve taxability for all 6 classifications via resolve_tax_rule
- Add non-zero taxable amounts to v_taxable_subtotal

### $0 rule:
- Only flag needs_review for a classification if its amount > 0
- A $0 classification with needs_review rule does NOT block the transaction

### Invoice branch:
- Read tax_classification_id from invoice_line_items to group amounts by classification
- Fall back to item_type for lines without tax_classification_id
- Resolve all 6 classifications from the grouped amounts

## Safety
- Does not change the function signature
- Does not change return structure (adds more keys to taxability_results)
- Existing callers reading material/labor/freight_delivery still work
*/

-- Drop and recreate calculate_tax_context with the fixes
CREATE OR REPLACE FUNCTION calculate_tax_context(
  p_transaction_type text,
  p_transaction_id uuid
) RETURNS jsonb AS $$
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

    -- Material: sum line_total for non-labor, non-customer-supplied items
    SELECT COALESCE(SUM(
      CASE WHEN COALESCE(item_type, 'part') != 'labor' AND COALESCE(is_customer_supplied, false) = false
           THEN line_total ELSE 0 END
    ), 0)
    INTO v_material_amount
    FROM proposal_line_items WHERE proposal_id = p_transaction_id;

    -- Labor: sum labor_total (or line_total for labor items)
    SELECT COALESCE(SUM(
      CASE WHEN item_type = 'labor' THEN COALESCE(labor_total, line_total)
           ELSE COALESCE(labor_total, 0) END
    ), 0)
    INTO v_labor_amount
    FROM proposal_line_items WHERE proposal_id = p_transaction_id;

    -- Design Fee
    SELECT COALESCE(project_design_amount, 0) + COALESCE(system_design_amount, 0)
    INTO v_design_fee_amount
    FROM proposals WHERE id = p_transaction_id;

    -- Project Management
    SELECT COALESCE(project_management_amount, 0)
    INTO v_pm_amount
    FROM proposals WHERE id = p_transaction_id;

    -- Credit Card Fee
    SELECT COALESCE(credit_card_fee_amount, 0)
    INTO v_ccf_amount
    FROM proposals WHERE id = p_transaction_id;

    -- Freight/Delivery from custom modifiers
    SELECT scc.id INTO v_freight_sc_id
    FROM special_charge_classifications scc
    WHERE scc.code = 'freight_delivery';

    SELECT ps.custom_modifier_1_special_charge_id, ps.custom_modifier_2_special_charge_id
    INTO v_cm1_sc_id, v_cm2_sc_id
    FROM proposal_settings ps WHERE ps.proposal_id = p_transaction_id;

    SELECT p.custom_modifier_1_amount, p.custom_modifier_2_amount
    INTO v_cm1_amount, v_cm2_amount
    FROM proposals p WHERE p.id = p_transaction_id;

    IF v_cm1_sc_id = v_freight_sc_id AND v_cm1_amount IS NOT NULL THEN
      v_freight_amount := v_freight_amount + v_cm1_amount;
    END IF;
    IF v_cm2_sc_id = v_freight_sc_id AND v_cm2_amount IS NOT NULL THEN
      v_freight_amount := v_freight_amount + v_cm2_amount;
    END IF;

  ELSIF p_transaction_type = 'change_order' THEN
    SELECT co.organization_id, co.tax_environment, co.tax_project_type, co.tax_rate
    INTO v_org_id, v_environment, v_project_type, v_tax_rate
    FROM change_orders co WHERE co.id = p_transaction_id;

    IF v_org_id IS NULL THEN
      RETURN jsonb_build_object('error', 'Change order not found');
    END IF;

    SELECT p.office_id, p.contact_id, p.jobsite_address, p.jobsite_city, p.jobsite_state, p.jobsite_zip
    INTO v_office_id, v_contact_id, v_jobsite_street, v_jobsite_city, v_jobsite_state, v_jobsite_zip
    FROM proposals p
    JOIN change_orders co ON co.proposal_id = p.id
    WHERE co.id = p_transaction_id;

    -- Material: exclude labor items and modifier items
    SELECT COALESCE(SUM(change_amount), 0)
    INTO v_material_amount
    FROM change_order_line_items
    WHERE change_order_id = p_transaction_id
      AND action_type <> 'modify_modifiers'
      AND COALESCE(item_type, 'material') <> 'labor';

    -- Labor: sum from labor items (replaces hardcoded 0)
    SELECT COALESCE(SUM(COALESCE(labor_total, change_amount)), 0)
    INTO v_labor_amount
    FROM change_order_line_items
    WHERE change_order_id = p_transaction_id
      AND action_type <> 'modify_modifiers'
      AND item_type = 'labor';

    -- Design Fee
    SELECT COALESCE(project_design_amount, 0) + COALESCE(system_design_amount, 0)
    INTO v_design_fee_amount
    FROM change_orders WHERE id = p_transaction_id;

    -- Project Management
    SELECT COALESCE(project_management_amount, 0)
    INTO v_pm_amount
    FROM change_orders WHERE id = p_transaction_id;

    -- Credit Card Fee
    SELECT COALESCE(credit_card_fee_amount, 0)
    INTO v_ccf_amount
    FROM change_orders WHERE id = p_transaction_id;

    -- Freight/Delivery from change order modifiers
    SELECT scc.id INTO v_freight_sc_id
    FROM special_charge_classifications scc
    WHERE scc.code = 'freight_delivery';

    SELECT co.custom_modifier_1_special_charge_id, co.custom_modifier_2_special_charge_id,
           co.custom_modifier_1_amount, co.custom_modifier_2_amount,
           co.apply_custom_modifier_1, co.apply_custom_modifier_2
    INTO v_cm1_sc_id, v_cm2_sc_id, v_cm1_amount, v_cm2_amount, v_cm1_apply, v_cm2_apply
    FROM change_orders co WHERE co.id = p_transaction_id;

    IF v_cm1_sc_id = v_freight_sc_id AND COALESCE(v_cm1_apply, true) AND v_cm1_amount IS NOT NULL THEN
      v_freight_amount := v_freight_amount + v_cm1_amount;
    END IF;
    IF v_cm2_sc_id = v_freight_sc_id AND COALESCE(v_cm2_apply, true) AND v_cm2_amount IS NOT NULL THEN
      v_freight_amount := v_freight_amount + v_cm2_amount;
    END IF;

  ELSIF p_transaction_type = 'invoice' THEN
    SELECT organization_id, office_id, contact_id
    INTO v_org_id, v_office_id, v_contact_id
    FROM invoices WHERE id = p_transaction_id;

    IF v_org_id IS NULL THEN
      RETURN jsonb_build_object('error', 'Invoice not found');
    END IF;

    SELECT p.tax_environment, p.tax_project_type, p.tax_rate,
           p.jobsite_address, p.jobsite_city, p.jobsite_state, p.jobsite_zip
    INTO v_environment, v_project_type, v_tax_rate,
         v_jobsite_street, v_jobsite_city, v_jobsite_state, v_jobsite_zip
    FROM proposals p
    JOIN invoices inv ON (inv.proposal_id = p.id OR inv.sales_order_id IN (
      SELECT so.id FROM sales_orders so WHERE so.proposal_id = p.id
    ))
    WHERE inv.id = p_transaction_id
    LIMIT 1;

    -- Group invoice line items by tax_classification_id, fall back to item_type
    -- Lines with tax_classification_id: use the classification code
    SELECT COALESCE(SUM(
      CASE WHEN COALESCE(tc.code, 
        CASE WHEN COALESCE(ili.item_type, 'material') = 'labor' THEN 'labor'
             ELSE 'material' END) = 'material'
           THEN ili.line_total ELSE 0 END
    ), 0)
    INTO v_material_amount
    FROM invoice_line_items ili
    LEFT JOIN tax_classifications tc ON tc.id = ili.tax_classification_id
    WHERE ili.invoice_id = p_transaction_id;

    SELECT COALESCE(SUM(
      CASE WHEN COALESCE(tc.code,
        CASE WHEN COALESCE(ili.item_type, 'material') = 'labor' THEN 'labor'
             ELSE 'material' END) = 'labor'
           THEN ili.line_total ELSE 0 END
    ), 0)
    INTO v_labor_amount
    FROM invoice_line_items ili
    LEFT JOIN tax_classifications tc ON tc.id = ili.tax_classification_id
    WHERE ili.invoice_id = p_transaction_id;

    SELECT COALESCE(SUM(
      CASE WHEN tc.code = 'design_fee' THEN ili.line_total ELSE 0 END
    ), 0)
    INTO v_design_fee_amount
    FROM invoice_line_items ili
    LEFT JOIN tax_classifications tc ON tc.id = ili.tax_classification_id
    WHERE ili.invoice_id = p_transaction_id;

    SELECT COALESCE(SUM(
      CASE WHEN tc.code = 'project_management' THEN ili.line_total ELSE 0 END
    ), 0)
    INTO v_pm_amount
    FROM invoice_line_items ili
    LEFT JOIN tax_classifications tc ON tc.id = ili.tax_classification_id
    WHERE ili.invoice_id = p_transaction_id;

    SELECT COALESCE(SUM(
      CASE WHEN tc.code = 'freight_delivery' THEN ili.line_total ELSE 0 END
    ), 0)
    INTO v_freight_amount
    FROM invoice_line_items ili
    LEFT JOIN tax_classifications tc ON tc.id = ili.tax_classification_id
    WHERE ili.invoice_id = p_transaction_id;

    SELECT COALESCE(SUM(
      CASE WHEN tc.code = 'credit_card_fee' THEN ili.line_total ELSE 0 END
    ), 0)
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

  -- 3. Resolve taxability for all 6 classifications
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

  -- 4. Check nexus/collection
  SELECT nexus_status INTO v_nexus_status
  FROM dealer_nexus_states
  WHERE organization_id = v_org_id
    AND state = v_state
    AND is_current = true
  LIMIT 1;

  v_nexus_status := COALESCE(v_nexus_status, 'unknown');

  IF v_nexus_status = 'yes' THEN
    v_collection_status := 'collect';
  ELSIF v_nexus_status = 'no' THEN
    v_collection_status := 'do_not_collect';
  ELSE
    v_collection_status := 'review_required';
    v_review_reasons := array_append(v_review_reasons,
      jsonb_build_object('layer', 'nexus', 'reason', 'Nexus status unknown for state ' || v_state));
  END IF;

  -- 5. Validate destination
  IF COALESCE(v_jobsite_street, '') = '' OR COALESCE(v_jobsite_city, '') = ''
     OR COALESCE(v_jobsite_state, '') = '' OR COALESCE(v_jobsite_zip, '') = '' THEN
    v_destination_result := jsonb_build_object(
      'street', v_jobsite_street, 'city', v_jobsite_city,
      'state', v_jobsite_state, 'zip', v_jobsite_zip,
      'review_required', true,
      'review_reason', 'Destination/jobsite address is incomplete'
    );
    v_review_reasons := array_append(v_review_reasons,
      jsonb_build_object('layer', 'destination', 'reason', 'Jobsite address incomplete'));
  ELSE
    v_destination_result := jsonb_build_object(
      'street', v_jobsite_street, 'city', v_jobsite_city,
      'state', v_jobsite_state, 'zip', v_jobsite_zip,
      'review_required', false
    );
  END IF;

  -- 6. Check exemption
  IF v_contact_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM tax_exemption_certificates
      WHERE contact_id = v_contact_id
        AND is_active = true
        AND (expiration_date IS NULL OR expiration_date > CURRENT_DATE)
    ) INTO v_is_exempt;

    IF v_is_exempt THEN
      SELECT COALESCE(certificate_number, id::text) INTO v_exemption_ref
      FROM tax_exemption_certificates
      WHERE contact_id = v_contact_id
        AND is_active = true
        AND (expiration_date IS NULL OR expiration_date > CURRENT_DATE)
      LIMIT 1;
    END IF;
  END IF;

  -- 7. Determine calculation status
  IF v_is_exempt THEN
    v_tax_calculation_status := 'exempt';
    v_tax_amount := 0;
  ELSIF v_collection_status = 'do_not_collect' THEN
    v_tax_calculation_status := 'not_collecting';
    v_tax_amount := 0;
  ELSIF array_length(v_review_reasons, 1) > 0 THEN
    v_tax_calculation_status := 'review_required';
    v_tax_amount := 0;
  ELSE
    v_tax_calculation_status := 'ready';

    -- Add taxable amounts for each classification
    IF v_material_taxability->>'taxability_status' = 'taxable' THEN
      v_taxable_subtotal := v_taxable_subtotal + v_material_amount;
    END IF;
    IF v_labor_taxability->>'taxability_status' = 'taxable' THEN
      v_taxable_subtotal := v_taxable_subtotal + v_labor_amount;
    END IF;
    IF v_freight_taxability->>'taxability_status' = 'taxable' THEN
      v_taxable_subtotal := v_taxable_subtotal + v_freight_amount;
    END IF;
    IF v_design_fee_taxability->>'taxability_status' = 'taxable' THEN
      v_taxable_subtotal := v_taxable_subtotal + v_design_fee_amount;
    END IF;
    IF v_pm_taxability->>'taxability_status' = 'taxable' THEN
      v_taxable_subtotal := v_taxable_subtotal + v_pm_amount;
    END IF;
    IF v_ccf_taxability->>'taxability_status' = 'taxable' THEN
      v_taxable_subtotal := v_taxable_subtotal + v_ccf_amount;
    END IF;

    v_tax_amount := round(v_taxable_subtotal * v_tax_rate, 2);
  END IF;

  -- 8. Return the complete context (READ ONLY)
  RETURN jsonb_build_object(
    'tax_calculation_status', v_tax_calculation_status,
    'taxability_results', v_taxability_results,
    'origin_result', v_origin_result,
    'collection_status', v_collection_status,
    'destination_result', v_destination_result,
    'tax_amount', v_tax_amount,
    'taxable_subtotal', v_taxable_subtotal,
    'tax_rate', v_tax_rate,
    'classification_amounts', jsonb_build_object(
      'material', v_material_amount,
      'labor', v_labor_amount,
      'freight_delivery', v_freight_amount,
      'design_fee', v_design_fee_amount,
      'project_management', v_pm_amount,
      'credit_card_fee', v_ccf_amount
    ),
    'review_reasons', to_jsonb(v_review_reasons),
    'exemption_reference', v_exemption_ref
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
