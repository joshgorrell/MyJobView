/*
# Rewrite calculate_change_order_totals to use resolve_tax_rule

## Purpose
Replaces the hardcoded Kansas taxability if/then blocks inside
calculate_change_order_totals with calls to resolve_tax_rule.

## Changes
- The function signature and all modifier logic remain unchanged.
- The hardcoded if/then block (v_parts_taxable / v_labor_taxable) is replaced
  with calls to resolve_tax_rule for 'material' and 'labor'.
- The change order resolves its state and organization from its parent proposal.
- When resolve_tax_rule returns 'needs_review' for either classification,
  tax_review_required is set to true on the change order.
- The existing logic of applying tax to the full running total when either
  parts or labor is taxable is preserved.

## Security
- SECURITY DEFINER (unchanged).
- search_path = 'public' (already set).

## Regression
- The Kansas regression tests verify that resolve_tax_rule produces the same
  taxability results as the hardcoded blocks for all KS environment/project
  type combinations.
*/

CREATE OR REPLACE FUNCTION public.calculate_change_order_totals(p_change_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF v_co_record.apply_credit_card_fee AND v_co_record.credit_card_fee_percent > 0 THEN
    v_credit_card_fee_amount := v_net_change * (v_co_record.credit_card_fee_percent / 100);
    v_running_total := v_running_total + v_credit_card_fee_amount;
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

  -- ── Resolve taxability via resolve_tax_rule ──────────────────────────
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
$function$;
