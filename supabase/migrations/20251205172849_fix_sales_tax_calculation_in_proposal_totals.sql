/*
  # Fix Sales Tax Calculation in Proposal Totals

  ## Problem
  The calculate_proposal_totals function was not calculating tax_amount.
  It was just reading the existing tax_amount value from the proposal,
  which was often $0.00 even when a tax_rate was set.

  ## Solution
  Update the function to:
  1. Calculate tax_amount = running_total * tax_rate
  2. Then add tax_amount to get final total
  3. Store the calculated tax_amount back to the proposal

  ## Notes
  - This will properly populate the tax_amount field for sales tax reports
  - The tax_rate must be set on the proposal (via frontend or tax jurisdiction)
  - Running total is the subtotal after all modifiers are applied
*/

CREATE OR REPLACE FUNCTION calculate_proposal_totals(p_proposal_id uuid)
RETURNS void AS $$
DECLARE
  v_parts_total numeric(10,2);
  v_labor_total numeric(10,2);
  v_subtotal numeric(10,2);
  v_running_total numeric(10,2);
  v_tax_rate numeric(5,4);
  v_tax_amount numeric(10,2);
  v_total numeric(10,2);
  v_deposit_amount numeric(10,2);
  v_deposit_type text;
  v_deposit_percent numeric;
  v_discount_percent numeric;
  v_project_mgmt_percent numeric;
  v_project_design_percent numeric;
  v_system_design_percent numeric;
  v_credit_card_fee_percent numeric;
  v_misc_parts_percent numeric;
  v_custom_mod_1_percent numeric;
  v_custom_mod_2_percent numeric;
  v_proposal_record record;
BEGIN
  -- Get proposal data
  SELECT * INTO v_proposal_record
  FROM proposals
  WHERE id = p_proposal_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Calculate parts total (sum of all line_total)
  SELECT COALESCE(SUM(line_total), 0)
  INTO v_parts_total
  FROM proposal_line_items
  WHERE proposal_id = p_proposal_id;

  -- Calculate labor total (sum of all labor_total)
  SELECT COALESCE(SUM(labor_total), 0)
  INTO v_labor_total
  FROM proposal_line_items
  WHERE proposal_id = p_proposal_id
    AND labor_total IS NOT NULL;

  -- Calculate subtotal
  v_subtotal := v_parts_total + v_labor_total;
  v_running_total := v_subtotal;

  -- Get modifiers from proposal_settings (fallback values)
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

  -- Override with proposal-level modifiers if they exist
  IF v_proposal_record.discount_percent IS NOT NULL AND v_proposal_record.discount_percent > 0 THEN
    v_discount_percent := v_proposal_record.discount_percent;
  END IF;
  IF v_proposal_record.project_management_percent IS NOT NULL AND v_proposal_record.project_management_percent > 0 THEN
    v_project_mgmt_percent := v_proposal_record.project_management_percent;
  END IF;
  IF v_proposal_record.project_design_percent IS NOT NULL AND v_proposal_record.project_design_percent > 0 THEN
    v_project_design_percent := v_proposal_record.project_design_percent;
  END IF;

  -- Apply modifiers
  IF v_discount_percent > 0 THEN
    v_running_total := v_running_total - (v_subtotal * (v_discount_percent / 100));
  END IF;
  IF v_project_mgmt_percent > 0 THEN
    v_running_total := v_running_total + (v_subtotal * (v_project_mgmt_percent / 100));
  END IF;
  IF v_project_design_percent > 0 THEN
    v_running_total := v_running_total + (v_subtotal * (v_project_design_percent / 100));
  END IF;
  IF v_system_design_percent > 0 THEN
    v_running_total := v_running_total + (v_subtotal * (v_system_design_percent / 100));
  END IF;
  IF v_credit_card_fee_percent > 0 THEN
    v_running_total := v_running_total + (v_subtotal * (v_credit_card_fee_percent / 100));
  END IF;
  IF v_misc_parts_percent > 0 THEN
    v_running_total := v_running_total + (v_subtotal * (v_misc_parts_percent / 100));
  END IF;
  IF v_custom_mod_1_percent > 0 THEN
    v_running_total := v_running_total + (v_subtotal * (v_custom_mod_1_percent / 100));
  END IF;
  IF v_custom_mod_2_percent > 0 THEN
    v_running_total := v_running_total + (v_subtotal * (v_custom_mod_2_percent / 100));
  END IF;

  -- Get tax rate from proposal (should be set from tax jurisdiction or override)
  v_tax_rate := COALESCE(v_proposal_record.tax_rate, 0);

  -- Calculate tax amount based on running total and tax rate
  v_tax_amount := v_running_total * v_tax_rate;

  -- Calculate final total
  v_total := v_running_total + v_tax_amount;

  -- Calculate deposit amount based on type
  IF v_deposit_type = 'percentage' THEN
    v_deposit_amount := v_total * (v_deposit_percent / 100);
  ELSIF v_deposit_type = 'parts_total' THEN
    v_deposit_amount := v_parts_total;
  ELSIF v_deposit_type = 'custom' THEN
    -- Get custom deposit amount from proposal_settings
    SELECT COALESCE(deposit_amount, 0)
    INTO v_deposit_amount
    FROM proposal_settings
    WHERE proposal_id = p_proposal_id;
  ELSE
    v_deposit_amount := 0;
  END IF;

  -- Update proposal with all calculated values including tax_amount
  UPDATE proposals
  SET 
    parts_total = v_parts_total,
    labor_total = v_labor_total,
    subtotal = v_subtotal,
    tax_amount = v_tax_amount,
    total = v_total,
    deposit_amount_due = v_deposit_amount,
    updated_at = now()
  WHERE id = p_proposal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
