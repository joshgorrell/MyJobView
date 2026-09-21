/*
# Remove Credit Card Fee from Project Pricing Functions

## Purpose
Credit Card Convenience Fee is a payment-method fee, NOT a project pricing component.
This migration removes CCF from the two DB functions that calculate project totals:
- calculate_proposal_totals: stop adding credit_card_fee_amount to proposal.total
- calculate_change_order_totals: stop adding credit_card_fee_amount to change_order.change_amount

## Changes
1. calculate_proposal_totals: Remove the line that adds v_credit_card_fee_amount to v_running_total.
   The credit_card_fee_amount column is still SET on the proposals table (preserving the legacy field),
   but it no longer inflates the project contract total.

2. calculate_change_order_totals: Remove the branch that calculates and adds credit_card_fee_amount
   to the change order running total. The credit_card_fee_amount column is still SET on change_orders
   (preserving the legacy field), but it no longer inflates the change order value.

## Impact
- Proposal totals will decrease by the credit card fee amount (3% of subtotal for affected proposals)
- Change order totals will decrease by the credit card fee amount if any CO had it applied
- The project contract value becomes independent of how the customer eventually chooses to pay

## Legacy Fields Preserved
- proposals.credit_card_fee_amount (still set, but no longer in total)
- proposal_settings.credit_card_fee_percent (still stored, no longer read by total calculation)
- change_orders.credit_card_fee_amount, credit_card_fee_percent, apply_credit_card_fee (still set, not in total)
*/

CREATE OR REPLACE FUNCTION calculate_proposal_totals(p_proposal_id uuid)
RETURNS void AS $$
DECLARE
  v_parts_total numeric(10,2);
  v_labor_total numeric(10,2);
  v_subtotal numeric(10,2);
  v_running_total numeric(10,2);
  v_tax_rate numeric(5,4);
  v_tax_environment text;
  v_tax_project_type text;
  v_tax_state text;
  v_parts_taxable boolean;
  v_labor_taxable boolean;
  v_parts_tax numeric(10,2);
  v_labor_tax numeric(10,2);
  v_tax_amount numeric(10,2);
  v_total numeric(10,2);
  v_deposit_amount numeric(10,2);
  v_deposit_type text;
  v_deposit_percent numeric;
  v_discount_percent numeric;
  v_discount_amount numeric(10,2);
  v_project_mgmt_percent numeric;
  v_project_mgmt_amount numeric(10,2);
  v_project_design_percent numeric;
  v_project_design_amount numeric(10,2);
  v_system_design_percent numeric;
  v_system_design_amount numeric(10,2);
  v_credit_card_fee_percent numeric;
  v_credit_card_fee_amount numeric(10,2);
  v_misc_parts_percent numeric;
  v_misc_parts_amount numeric(10,2);
  v_custom_mod_1_percent numeric;
  v_custom_mod_1_amount numeric(10,2);
  v_custom_mod_2_percent numeric;
  v_custom_mod_2_amount numeric(10,2);
  v_proposal_record record;
  v_material_result jsonb;
  v_labor_result jsonb;
  v_org_id uuid;
  v_review_required boolean := false;
BEGIN
  SELECT * INTO v_proposal_record
  FROM proposals
  WHERE id = p_proposal_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Parts total: exclude customer-supplied items (material cost is zero)
  SELECT COALESCE(SUM(line_total), 0)
  INTO v_parts_total
  FROM proposal_line_items
  WHERE proposal_id = p_proposal_id
  AND COALESCE(item_type, 'part') != 'labor'
  AND COALESCE(is_customer_supplied, false) = false;

  -- Labor total: INCLUDE customer-supplied items' labor
  SELECT
    COALESCE(SUM(
      CASE
        WHEN item_type = 'labor' THEN COALESCE(labor_total, line_total)
        ELSE COALESCE(labor_total, 0)
      END
    ), 0)
  INTO v_labor_total
  FROM proposal_line_items
  WHERE proposal_id = p_proposal_id;

  v_subtotal := v_parts_total + v_labor_total;
  v_running_total := v_subtotal;

  SELECT
    COALESCE(ps.discount_percent, 0),
    COALESCE(ps.project_management_percent, 0),
    COALESCE(ps.project_design_percent, 0),
    COALESCE(ps.system_design_percent, 0),
    COALESCE(ps.credit_card_fee_percent, 0),
    COALESCE(ps.misc_parts_percent, 0),
    COALESCE(ps.custom_modifier_1_percent, 0),
    COALESCE(ps.custom_modifier_2_percent, 0),
    COALESCE(ps.deposit_type, 'percentage'),
    COALESCE(ps.deposit_percent, 50)
  INTO
    v_discount_percent,
    v_project_mgmt_percent,
    v_project_design_percent,
    v_system_design_percent,
    v_credit_card_fee_percent,
    v_misc_parts_percent,
    v_custom_mod_1_percent,
    v_custom_mod_2_percent,
    v_deposit_type,
    v_deposit_percent
  FROM proposal_settings ps
  WHERE ps.proposal_id = p_proposal_id;

  IF v_proposal_record.discount_percent IS NOT NULL AND v_proposal_record.discount_percent > 0 THEN
    v_discount_percent := v_proposal_record.discount_percent;
  END IF;
  IF v_proposal_record.project_management_percent IS NOT NULL AND v_proposal_record.project_management_percent > 0 THEN
    v_project_mgmt_percent := v_proposal_record.project_management_percent;
  END IF;
  IF v_proposal_record.project_design_percent IS NOT NULL AND v_proposal_record.project_design_percent > 0 THEN
    v_project_design_percent := v_proposal_record.project_design_percent;
  END IF;

  v_discount_amount := v_subtotal * (v_discount_percent / 100);
  v_project_mgmt_amount := v_subtotal * (v_project_mgmt_percent / 100);
  v_project_design_amount := v_subtotal * (v_project_design_percent / 100);
  v_system_design_amount := v_subtotal * (v_system_design_percent / 100);
  -- Credit card fee is still calculated and stored on the proposal record
  -- but is NO LONGER added to the project total (it is a payment-method fee, not project pricing)
  v_credit_card_fee_amount := v_subtotal * (v_credit_card_fee_percent / 100);
  v_misc_parts_amount := v_subtotal * (v_misc_parts_percent / 100);
  v_custom_mod_1_amount := v_subtotal * (v_custom_mod_1_percent / 100);
  v_custom_mod_2_amount := v_subtotal * (v_custom_mod_2_percent / 100);

  v_running_total := v_running_total
    - v_discount_amount
    + v_project_mgmt_amount
    + v_project_design_amount
    + v_system_design_amount
    + v_misc_parts_amount
    + v_custom_mod_1_amount
    + v_custom_mod_2_amount;

  v_tax_rate := COALESCE(v_proposal_record.tax_rate, 0);
  v_tax_environment := COALESCE(v_proposal_record.tax_environment, 'residential');
  v_tax_project_type := COALESCE(v_proposal_record.tax_project_type, 'general_installation_repair');
  v_tax_state := COALESCE(v_proposal_record.jobsite_state, '');
  v_org_id := v_proposal_record.organization_id;

  -- Resolve taxability via resolve_tax_rule
  v_material_result := resolve_tax_rule(v_tax_state, v_org_id, v_tax_environment, v_tax_project_type, 'material');
  v_labor_result := resolve_tax_rule(v_tax_state, v_org_id, v_tax_environment, v_tax_project_type, 'labor');

  v_parts_taxable := (v_material_result->>'taxability_status' = 'taxable');
  v_labor_taxable := (v_labor_result->>'taxability_status' = 'taxable');

  IF v_material_result->>'taxability_status' = 'needs_review'
     OR v_labor_result->>'taxability_status' = 'needs_review' THEN
    v_review_required := true;
  END IF;

  IF v_parts_taxable THEN
    v_parts_tax := v_parts_total * v_tax_rate;
  ELSE
    v_parts_tax := 0;
  END IF;

  IF v_labor_taxable THEN
    v_labor_tax := v_labor_total * v_tax_rate;
  ELSE
    v_labor_tax := 0;
  END IF;

  v_tax_amount := v_parts_tax + v_labor_tax;
  v_total := v_running_total + v_tax_amount;

  IF v_deposit_type = 'percentage' THEN
    v_deposit_amount := v_total * (v_deposit_percent / 100);
  ELSIF v_deposit_type = 'parts_total' THEN
    v_deposit_amount := v_parts_total;
  ELSIF v_deposit_type = 'custom' THEN
    SELECT COALESCE(deposit_amount, 0)
    INTO v_deposit_amount
    FROM proposal_settings
    WHERE proposal_id = p_proposal_id;
  ELSE
    v_deposit_amount := 0;
  END IF;

  UPDATE proposals
  SET
    parts_total = v_parts_total,
    labor_total = v_labor_total,
    subtotal = v_subtotal,
    discount_amount = v_discount_amount,
    project_management_amount = v_project_mgmt_amount,
    project_design_amount = v_project_design_amount,
    system_design_amount = v_system_design_amount,
    credit_card_fee_amount = v_credit_card_fee_amount,
    misc_parts_amount = v_misc_parts_amount,
    custom_modifier_1_amount = v_custom_mod_1_amount,
    custom_modifier_2_amount = v_custom_mod_2_amount,
    tax_amount = v_tax_amount,
    total = v_total,
    deposit_amount_due = v_deposit_amount,
    tax_review_required = v_review_required,
    updated_at = now()
  WHERE id = p_proposal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION calculate_change_order_totals(p_change_order_id uuid)
RETURNS void AS $$
DECLARE
  v_net_change        numeric(10,2) := 0;
  v_running_total     numeric(10,2) := 0;
  v_tax_rate          numeric(5,4)  := 0;
  v_tax_environment   text;
  v_tax_project_type  text;
  v_tax_state         text;
  v_parts_taxable     boolean;
  v_labor_taxable     boolean;
  v_tax_amount        numeric(10,2) := 0;
  v_change_amount     numeric(10,2) := 0;
  v_co_record         record;
  v_org_id            uuid;
  v_review_required   boolean := false;
  v_material_result   jsonb;
  v_labor_result      jsonb;

  -- Modifier amounts
  v_discount_amount        numeric(10,2) := 0;
  v_project_mgmt_amount    numeric(10,2) := 0;
  v_project_design_amount  numeric(10,2) := 0;
  v_system_design_amount   numeric(10,2) := 0;
  v_credit_card_fee_amount numeric(10,2) := 0;
  v_misc_parts_amount      numeric(10,2) := 0;
  v_custom_mod_1_amount    numeric(10,2) := 0;
  v_custom_mod_2_amount    numeric(10,2) := 0;
BEGIN
  SELECT * INTO v_co_record
  FROM change_orders
  WHERE id = p_change_order_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Sum the signed change_amount from each line item (the true delta per item).
  -- Exclude modify_modifiers rows as those are handled via modifier fields.
  SELECT COALESCE(SUM(change_amount), 0)
  INTO v_net_change
  FROM change_order_line_items
  WHERE change_order_id = p_change_order_id
  AND action_type <> 'modify_modifiers';

  v_running_total := v_net_change;

  -- Apply modifiers (percentages applied to the pre-modifier net change)
  IF v_co_record.apply_discount AND v_co_record.discount_percent > 0 THEN
    v_discount_amount := v_net_change * (v_co_record.discount_percent / 100);
    v_running_total := v_running_total - v_discount_amount;
  END IF;

  IF v_co_record.apply_project_management AND v_co_record.project_management_percent > 0 THEN
    v_project_mgmt_amount := v_net_change * (v_co_record.project_management_percent / 100);
    v_running_total := v_running_total + v_project_mgmt_amount;
  END IF;

  IF v_co_record.apply_project_design AND v_co_record.project_design_percent > 0 THEN
    v_project_design_amount := v_net_change * (v_co_record.project_design_percent / 100);
    v_running_total := v_running_total + v_project_design_amount;
  END IF;

  IF v_co_record.apply_system_design AND v_co_record.system_design_percent > 0 THEN
    v_system_design_amount := v_net_change * (v_co_record.system_design_percent / 100);
    v_running_total := v_running_total + v_system_design_amount;
  END IF;

  -- Credit card fee is still calculated and stored on the change order record
  -- but is NO LONGER added to the change order total (payment-method fee, not project pricing)
  IF v_co_record.apply_credit_card_fee AND v_co_record.credit_card_fee_percent > 0 THEN
    v_credit_card_fee_amount := v_net_change * (v_co_record.credit_card_fee_percent / 100);
  END IF;

  IF v_co_record.apply_misc_parts AND v_co_record.misc_parts_percent > 0 THEN
    v_misc_parts_amount := v_net_change * (v_co_record.misc_parts_percent / 100);
    v_running_total := v_running_total + v_misc_parts_amount;
  END IF;

  IF v_co_record.apply_custom_modifier_1 AND v_co_record.custom_modifier_1_percent > 0 THEN
    v_custom_mod_1_amount := v_net_change * (v_co_record.custom_modifier_1_percent / 100);
    v_running_total := v_running_total + v_custom_mod_1_amount;
  END IF;

  IF v_co_record.apply_custom_modifier_2 AND v_co_record.custom_modifier_2_percent > 0 THEN
    v_custom_mod_2_amount := v_net_change * (v_co_record.custom_modifier_2_percent / 100);
    v_running_total := v_running_total + v_custom_mod_2_amount;
  END IF;

  -- Tax configuration
  v_tax_rate         := COALESCE(v_co_record.tax_rate, 0);
  v_tax_environment  := COALESCE(v_co_record.tax_environment, 'residential');
  v_tax_project_type := COALESCE(v_co_record.tax_project_type, 'general_installation_repair');

  -- Resolve state and org from the parent proposal
  SELECT p.jobsite_state, p.organization_id
  INTO v_tax_state, v_org_id
  FROM proposals p
  WHERE p.id = v_co_record.proposal_id;

  v_tax_state := COALESCE(v_tax_state, '');

  -- Resolve taxability via resolve_tax_rule
  v_material_result := resolve_tax_rule(v_tax_state, v_org_id, v_tax_environment, v_tax_project_type, 'material');
  v_labor_result := resolve_tax_rule(v_tax_state, v_org_id, v_tax_environment, v_tax_project_type, 'labor');

  v_parts_taxable := (v_material_result->>'taxability_status' = 'taxable');
  v_labor_taxable := (v_labor_result->>'taxability_status' = 'taxable');

  IF v_material_result->>'taxability_status' = 'needs_review'
     OR v_labor_result->>'taxability_status' = 'needs_review' THEN
    v_review_required := true;
  END IF;

  -- Apply tax only when taxable (use full running total since we no longer split parts/labor)
  IF v_parts_taxable OR v_labor_taxable THEN
    v_tax_amount := v_running_total * v_tax_rate;
  END IF;

  v_change_amount := v_running_total + v_tax_amount;

  UPDATE change_orders
  SET
    subtotal_after_modifiers     = v_running_total,
    discount_amount              = v_discount_amount,
    project_management_amount    = v_project_mgmt_amount,
    project_design_amount        = v_project_design_amount,
    system_design_amount         = v_system_design_amount,
    credit_card_fee_amount       = v_credit_card_fee_amount,
    misc_parts_amount            = v_misc_parts_amount,
    custom_modifier_1_amount     = v_custom_mod_1_amount,
    custom_modifier_2_amount     = v_custom_mod_2_amount,
    tax_amount                   = v_tax_amount,
    change_amount                = v_change_amount,
    new_contract_total           = COALESCE(original_contract_amount, 0) + v_change_amount,
    tax_review_required          = v_review_required,
    updated_at                   = now()
  WHERE id = p_change_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
