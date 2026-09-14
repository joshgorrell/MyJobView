/*
# Rewrite calculate_proposal_totals to use resolve_tax_rule

## Purpose
Replaces the hardcoded Kansas taxability if/then blocks inside
calculate_proposal_totals with calls to the new resolve_tax_rule function.
This makes the proposal calculation state-agnostic and driven by the
database rules engine.

## Changes
- The function signature and all modifier/deposit logic remain unchanged.
- The hardcoded if/then block (v_parts_taxable / v_labor_taxable) is replaced
  with two calls to resolve_tax_rule for 'material' and 'labor' classifications.
- The function now reads the jobsite state from the proposal record to
  determine which state's rules to apply.
- When resolve_tax_rule returns 'needs_review', the taxable flag is set to
  false for that classification and tax_review_required is set to true on
  the proposal.

## Security
- SECURITY DEFINER (unchanged).
- search_path = 'public' added explicitly.

## Regression
- All 20 Kansas regression tests pass against resolve_tax_rule (verified
  before this migration).
- The new function produces identical results for all existing Kansas
  proposals.
*/

CREATE OR REPLACE FUNCTION public.calculate_proposal_totals(p_proposal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_credit_card_fee_amount := v_subtotal * (v_credit_card_fee_percent / 100);
  v_misc_parts_amount := v_subtotal * (v_misc_parts_percent / 100);
  v_custom_mod_1_amount := v_subtotal * (v_custom_mod_1_percent / 100);
  v_custom_mod_2_amount := v_subtotal * (v_custom_mod_2_percent / 100);

  v_running_total := v_running_total
  - v_discount_amount
  + v_project_mgmt_amount
  + v_project_design_amount
  + v_system_design_amount
  + v_credit_card_fee_amount
  + v_misc_parts_amount
  + v_custom_mod_1_amount
  + v_custom_mod_2_amount;

  v_tax_rate := COALESCE(v_proposal_record.tax_rate, 0);
  v_tax_environment := COALESCE(v_proposal_record.tax_environment, 'residential');
  v_tax_project_type := COALESCE(v_proposal_record.tax_project_type, 'general_installation_repair');
  v_tax_state := COALESCE(v_proposal_record.jobsite_state, '');
  v_org_id := v_proposal_record.organization_id;

  -- ── Resolve taxability via resolve_tax_rule ──────────────────────────
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
$function$;
