/*
# Six-Classification Billing Allocation Helper

## Purpose
A centralized, testable function that computes the proportional allocation
of a billed amount across the 6 tax classifications (material, labor, design_fee,
project_management, freight_delivery, credit_card_fee).

This is used by:
- Progress billing (original contract)
- Change Order billing
- Deposit billing (if applicable)

## Function: get_billing_classification_composition

Input: p_transaction_type ('proposal' or 'change_order'), p_transaction_id
Output: jsonb array of {classification_code, amount, percentage} for each
        classification with a non-zero amount, plus the total classified amount.

Only classifications with non-zero amounts are returned. No $0 lines.

## Function: allocate_billing_amount

Input: p_transaction_type, p_transaction_id, p_amount_to_bill
Output: jsonb array of {classification_code, allocated_amount} for each
        applicable classification, with deterministic rounding.

The last non-zero classification absorbs the rounding remainder so all
allocated amounts sum exactly to p_amount_to_bill.

## Safety
- Read-only functions
- No table modifications
- Handles edge case: total classified amount = 0 (returns empty allocation)
*/

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
  v_ccf_amount numeric := 0;
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

    SELECT COALESCE(credit_card_fee_amount, 0)
    INTO v_ccf_amount
    FROM proposals WHERE id = p_transaction_id;

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

    SELECT COALESCE(credit_card_fee_amount, 0)
    INTO v_ccf_amount
    FROM change_orders WHERE id = p_transaction_id;

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
             + v_pm_amount + v_freight_amount + v_ccf_amount;

  -- Build array of non-zero classifications
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
  IF v_ccf_amount > 0 THEN
    v_result := array_append(v_result, jsonb_build_object(
      'classification_code', 'credit_card_fee',
      'amount', v_ccf_amount,
      'percentage', CASE WHEN v_total > 0 THEN v_ccf_amount / v_total ELSE 0 END
    ));
  END IF;

  RETURN jsonb_build_object(
    'classifications', to_jsonb(v_result),
    'total_classified_amount', v_total
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION allocate_billing_amount(
  p_transaction_type text,
  p_transaction_id uuid,
  p_amount_to_bill numeric
) RETURNS jsonb AS $$
DECLARE
  v_composition jsonb;
  v_classifications jsonb;
  v_total numeric;
  v_allocated numeric[] := ARRAY[]::numeric[];
  v_codes text[] := ARRAY[]::text[];
  v_remaining numeric;
  v_sum_allocated numeric := 0;
  v_result jsonb[] := ARRAY[]::jsonb[];
  v_class jsonb;
  v_code text;
  v_amount numeric;
  v_pct numeric;
  v_allocated_amount numeric;
  v_count integer;
  v_i integer;
BEGIN
  -- Get the composition
  v_composition := get_billing_classification_composition(p_transaction_type, p_transaction_id);
  v_classifications := v_composition->'classifications';
  v_total := (v_composition->>'total_classified_amount')::numeric;

  -- Edge case: nothing to allocate
  IF v_total = 0 OR p_amount_to_bill = 0 THEN
    RETURN jsonb_build_object('allocations', '[]'::jsonb, 'total_allocated', 0);
  END IF;

  -- First pass: allocate proportionally, track for rounding
  v_count := jsonb_array_length(v_classifications);
  v_remaining := p_amount_to_bill;

  FOR v_i IN 0..v_count - 1 LOOP
    v_class := v_classifications->v_i;
    v_code := v_class->>'classification_code';
    v_pct := (v_class->>'percentage')::numeric;

    IF v_i = v_count - 1 THEN
      -- Last classification absorbs the rounding remainder
      v_allocated_amount := round(v_remaining, 2);
    ELSE
      v_allocated_amount := round(p_amount_to_bill * v_pct, 2);
      v_remaining := v_remaining - v_allocated_amount;
    END IF;

    v_result := array_append(v_result, jsonb_build_object(
      'classification_code', v_code,
      'allocated_amount', v_allocated_amount
    ));
    v_sum_allocated := v_sum_allocated + v_allocated_amount;
  END LOOP;

  RETURN jsonb_build_object(
    'allocations', to_jsonb(v_result),
    'total_allocated', v_sum_allocated
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
