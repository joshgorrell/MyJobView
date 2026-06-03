/*
  # Fix calculate_change_order_totals to use change_amount instead of new_total

  ## Problem
  The RPC was computing parts_total and labor_total by summing `new_total` and
  `labor_total` from line items, which is incorrect for remove/modify actions
  (removed items have new_total = 0, not negative). This caused the stored
  `change_amount` on the change_orders row to show a large positive sum of all
  item prices rather than the correct net delta.

  ## Fix
  Compute the net change by summing the pre-calculated `change_amount` field on
  each line item (excluding modify_modifiers rows), which already holds the
  correct signed delta for every action type (add/remove/modify_quantity/
  modify_price/modify_labor). Tax and modifiers are then applied on top of
  that net figure.

  This matches the fallback logic already present in the frontend
  `updateCOTotals` function.
*/

CREATE OR REPLACE FUNCTION public.calculate_change_order_totals(p_change_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_net_change        numeric(10,2) := 0;
  v_running_total     numeric(10,2) := 0;
  v_tax_rate          numeric(5,4)  := 0;
  v_tax_environment   text;
  v_tax_project_type  text;
  v_parts_taxable     boolean;
  v_labor_taxable     boolean;
  v_tax_amount        numeric(10,2) := 0;
  v_change_amount     numeric(10,2) := 0;
  v_co_record         record;

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

  v_parts_taxable := true;
  v_labor_taxable := false;

  IF v_tax_environment = 'residential' THEN
    IF v_tax_project_type IN ('original_construction', 'remodel') THEN
      v_parts_taxable := true;
      v_labor_taxable := false;
    ELSIF v_tax_project_type = 'general_installation_repair' THEN
      v_parts_taxable := true;
      v_labor_taxable := true;
    END IF;
  ELSIF v_tax_environment = 'commercial' THEN
    IF v_tax_project_type = 'original_construction' THEN
      v_parts_taxable := true;
      v_labor_taxable := false;
    ELSIF v_tax_project_type IN ('remodel', 'general_installation_repair') THEN
      v_parts_taxable := true;
      v_labor_taxable := true;
    END IF;
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
    updated_at                   = now()
  WHERE id = p_change_order_id;
END;
$$;
