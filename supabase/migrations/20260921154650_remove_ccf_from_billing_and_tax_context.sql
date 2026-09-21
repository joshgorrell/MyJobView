/*
# Remove Credit Card Fee from Project Billing Composition, Tax Context, and Deposit Allocation

## Purpose
Credit Card Convenience Fee is a payment-method fee, not a project billing classification.
This migration removes CCF from:
1. get_billing_classification_composition: CCF amount set to 0 for proposals and change orders.
   Only 5 project classifications participate in billing allocation: Material, Labor, Design Fee,
   Project Management, Freight/Delivery.
2. calculate_tax_context: CCF amount set to 0 for proposal and change_order branches.
   The invoice branch is unchanged (invoices may legitimately have CCF line items from payment events).
   CCF taxability is still resolved for all branches (it remains a valid tax classification).
   The $0 rule means CCF will never trigger review_reasons for project contexts.
3. classify_deposit_invoice: Remove the CCF taxability resolution and line-item creation branch.
   Since allocate_billing_amount no longer returns CCF allocations, deposits only contain
   the 5 project classifications.

## Impact
- Progress invoices: no CCF line items created during billing allocation
- Deposits: no CCF line items created during deposit classification
- Tax context for proposals/COs: CCF amount is $0, no tax calculated on CCF
- Tax context for invoices: unchanged (CCF line items from payment events still resolved)
- The credit_card_fee tax classification remains in tax_classifications table (not deleted)

## Legacy Fields Preserved
- proposals.credit_card_fee_amount (still set by calculate_proposal_totals, not used in billing)
- change_orders.credit_card_fee_amount (still set by calculate_change_order_totals, not used in billing)
- tax_snapshots.credit_card_fee_amount (will be 0 for new project snapshots)
*/

-- 1. get_billing_classification_composition: remove CCF from project composition
CREATE OR REPLACE FUNCTION get_billing_classification_composition(
  p_transaction_type text,
  p_transaction_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_material_amount numeric := 0;
  v_labor_amount numeric := 0;
  v_design_fee_amount numeric := 0;
  v_pm_amount numeric := 0;
  v_freight_amount numeric := 0;
  v_total numeric := 0;
  v_result jsonb[] := ARRAY[]::jsonb[];
  v_freight_sc_id uuid;
  v_cm1_sc_id uuid;
  v_cm2_sc_id uuid;
  v_cm1_amount numeric;
  v_cm2_amount numeric;
  v_cm1_apply boolean;
  v_cm2_apply boolean;
BEGIN
IF p_transaction_type = 'proposal' THEN
SELECT COALESCE(SUM(
CASE WHEN COALESCE(item_type, 'part') != 'labor' AND COALESCE(is_customer_supplied, false) = false
THEN line_total ELSE 0 END
), 0)
INTO v_material_amount
FROM proposal_line_items WHERE proposal_id = p_transaction_id;

SELECT COALESCE(SUM(
CASE WHEN item_type = 'labor' THEN COALESCE(labor_total, line_total)
ELSE COALESCE(labor_total, 0) END
), 0)
INTO v_labor_amount
FROM proposal_line_items WHERE proposal_id = p_transaction_id;

SELECT COALESCE(project_design_amount, 0) + COALESCE(system_design_amount, 0)
INTO v_design_fee_amount
FROM proposals WHERE id = p_transaction_id;

SELECT COALESCE(project_management_amount, 0)
INTO v_pm_amount
FROM proposals WHERE id = p_transaction_id;

-- Credit Card Fee: NOT part of project billing composition (payment-method fee)
-- v_ccf_amount remains 0

-- Freight from custom modifiers
SELECT scc.id INTO v_freight_sc_id
FROM special_charge_classifications scc WHERE scc.code = 'freight_delivery';

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
SELECT COALESCE(SUM(change_amount), 0)
INTO v_material_amount
FROM change_order_line_items
WHERE change_order_id = p_transaction_id
AND action_type <> 'modify_modifiers'
AND COALESCE(item_type, 'material') <> 'labor';

SELECT COALESCE(SUM(COALESCE(labor_total, change_amount)), 0)
INTO v_labor_amount
FROM change_order_line_items
WHERE change_order_id = p_transaction_id
AND action_type <> 'modify_modifiers'
AND item_type = 'labor';

SELECT COALESCE(project_design_amount, 0) + COALESCE(system_design_amount, 0)
INTO v_design_fee_amount
FROM change_orders WHERE id = p_transaction_id;

SELECT COALESCE(project_management_amount, 0)
INTO v_pm_amount
FROM change_orders WHERE id = p_transaction_id;

-- Credit Card Fee: NOT part of project billing composition (payment-method fee)
-- v_ccf_amount remains 0

-- Freight from CO modifiers
SELECT scc.id INTO v_freight_sc_id
FROM special_charge_classifications scc WHERE scc.code = 'freight_delivery';

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

ELSE
RETURN jsonb_build_object('error', 'Unknown transaction type: ' || p_transaction_type);
END IF;

v_total := v_material_amount + v_labor_amount + v_design_fee_amount
+ v_pm_amount + v_freight_amount;

-- Build array of non-zero classifications (5 project classifications only)
IF v_material_amount > 0 THEN
  v_result := array_append(v_result, jsonb_build_object(
    'classification_code', 'material',
    'amount', v_material_amount,
    'percentage', CASE WHEN v_total > 0 THEN v_material_amount / v_total ELSE 0 END
  ));
END IF;
IF v_labor_amount > 0 THEN
  v_result := array_append(v_result, jsonb_build_object(
    'classification_code', 'labor',
    'amount', v_labor_amount,
    'percentage', CASE WHEN v_total > 0 THEN v_labor_amount / v_total ELSE 0 END
  ));
END IF;
IF v_design_fee_amount > 0 THEN
  v_result := array_append(v_result, jsonb_build_object(
    'classification_code', 'design_fee',
    'amount', v_design_fee_amount,
    'percentage', CASE WHEN v_total > 0 THEN v_design_fee_amount / v_total ELSE 0 END
  ));
END IF;
IF v_pm_amount > 0 THEN
  v_result := array_append(v_result, jsonb_build_object(
    'classification_code', 'project_management',
    'amount', v_pm_amount,
    'percentage', CASE WHEN v_total > 0 THEN v_pm_amount / v_total ELSE 0 END
  ));
END IF;
IF v_freight_amount > 0 THEN
  v_result := array_append(v_result, jsonb_build_object(
    'classification_code', 'freight_delivery',
    'amount', v_freight_amount,
    'percentage', CASE WHEN v_total > 0 THEN v_freight_amount / v_total ELSE 0 END
  ));
END IF;

RETURN jsonb_build_object(
  'classifications', to_jsonb(v_result),
  'total_classified_amount', v_total
);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. calculate_tax_context: remove CCF from proposal and change_order branches
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

-- Credit Card Fee: NOT sourced from proposal for project tax context
-- v_ccf_amount remains 0 (payment-method fee, not project pricing)

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

-- Labor: sum from labor items
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

-- Credit Card Fee: NOT sourced from change order for project tax context
-- v_ccf_amount remains 0 (payment-method fee, not project pricing)

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

-- Invoice branch: CCF amount IS read from line items (payment events may create CCF lines)
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


-- 3. classify_deposit_invoice: remove CCF taxability resolution and line-item branch
CREATE OR REPLACE FUNCTION classify_deposit_invoice(
  p_invoice_id uuid,
  p_proposal_id uuid
) RETURNS void AS $$
DECLARE
  v_deposit_amount numeric;
  v_org_id uuid;
  v_tax_rate numeric;
  v_environment text;
  v_project_type text;
  v_state text;
  v_allocation jsonb;
  v_allocations jsonb;
  v_alloc jsonb;
  v_class_code text;
  v_alloc_amount numeric;
  v_class_id uuid;
  v_taxable boolean;
  v_taxable_subtotal numeric := 0;
  v_tax_amount numeric := 0;
  v_sort_order integer := 0;
  v_material_taxability jsonb;
  v_labor_taxability jsonb;
  v_freight_taxability jsonb;
  v_design_fee_taxability jsonb;
  v_pm_taxability jsonb;
  v_item_type text;
BEGIN
  -- Get deposit amount from existing line items
  SELECT COALESCE(SUM(amount), 0) INTO v_deposit_amount
  FROM invoice_line_items WHERE invoice_id = p_invoice_id;

  IF v_deposit_amount = 0 THEN
    RETURN;
  END IF;

  -- Get proposal info
  SELECT organization_id, tax_rate, tax_environment, tax_project_type, jobsite_state
  INTO v_org_id, v_tax_rate, v_environment, v_project_type, v_state
  FROM proposals WHERE id = p_proposal_id;

  v_tax_rate := COALESCE(v_tax_rate, 0);
  v_environment := COALESCE(v_environment, 'residential');
  v_project_type := COALESCE(v_project_type, 'general_installation_repair');
  v_state := COALESCE(v_state, '');

  -- Delete existing unclassified line items
  DELETE FROM invoice_line_items WHERE invoice_id = p_invoice_id;

  -- Get classified allocation (5 project classifications only, no CCF)
  v_allocation := allocate_billing_amount('proposal', p_proposal_id, v_deposit_amount);
  v_allocations := v_allocation->'allocations';

  IF jsonb_array_length(v_allocations) = 0 THEN
    -- Fallback: single unclassified line
    INSERT INTO invoice_line_items (
      invoice_id, organization_id,
      description, quantity, unit_price, amount, is_taxable, sort_order
    ) VALUES (
      p_invoice_id, v_org_id,
      'Deposit', 1, v_deposit_amount, v_deposit_amount, false, 0
    );
    RETURN;
  END IF;

  -- Resolve taxability for 5 project classifications (no CCF in deposits)
  v_material_taxability := resolve_tax_rule(v_state, v_org_id, v_environment, v_project_type, 'material');
  v_labor_taxability := resolve_tax_rule(v_state, v_org_id, v_environment, v_project_type, 'labor');
  v_freight_taxability := resolve_tax_rule(v_state, v_org_id, v_environment, v_project_type, 'freight_delivery');
  v_design_fee_taxability := resolve_tax_rule(v_state, v_org_id, v_environment, v_project_type, 'design_fee');
  v_pm_taxability := resolve_tax_rule(v_state, v_org_id, v_environment, v_project_type, 'project_management');

  v_taxable_subtotal := 0;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(v_allocations) LOOP
    v_class_code := v_alloc->>'classification_code';
    v_alloc_amount := (v_alloc->>'allocated_amount')::numeric;

    SELECT tc.id INTO v_class_id
    FROM tax_classifications tc
    WHERE tc.code = v_class_code AND tc.organization_id = v_org_id
    LIMIT 1;

    v_taxable := false;
    v_item_type := 'service';
    IF v_class_code = 'material' THEN
      v_taxable := (v_material_taxability->>'taxability_status') = 'taxable';
      v_item_type := 'material';
    ELSIF v_class_code = 'labor' THEN
      v_taxable := (v_labor_taxability->>'taxability_status') = 'taxable';
      v_item_type := 'labor';
    ELSIF v_class_code = 'freight_delivery' THEN
      v_taxable := (v_freight_taxability->>'taxability_status') = 'taxable';
    ELSIF v_class_code = 'design_fee' THEN
      v_taxable := (v_design_fee_taxability->>'taxability_status') = 'taxable';
    ELSIF v_class_code = 'project_management' THEN
      v_taxable := (v_pm_taxability->>'taxability_status') = 'taxable';
    END IF;

    IF v_taxable THEN
      v_taxable_subtotal := v_taxable_subtotal + v_alloc_amount;
    END IF;

    INSERT INTO invoice_line_items (
      invoice_id, organization_id,
      description, quantity, unit_price, amount,
      item_type, is_taxable, tax_amount,
      tax_classification_id, sort_order
    ) VALUES (
      p_invoice_id, v_org_id,
      'Deposit — ' || v_class_code,
      1, v_alloc_amount, v_alloc_amount,
      v_item_type, v_taxable,
      CASE WHEN v_taxable THEN round(v_alloc_amount * v_tax_rate, 2) ELSE 0 END,
      v_class_id, v_sort_order
    );
    v_sort_order := v_sort_order + 1;
  END LOOP;

  v_tax_amount := round(v_taxable_subtotal * v_tax_rate, 2);

  -- Update invoice totals
  UPDATE invoices SET
    tax_amount = v_tax_amount,
    total = v_deposit_amount + v_tax_amount
  WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
