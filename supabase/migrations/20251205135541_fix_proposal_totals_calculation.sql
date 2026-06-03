/*
  # Fix Proposal Totals Calculation
  
  1. Updates
    - Modify the `calculate_proposal_totals` function to properly calculate subtotal and total
    - Subtotal = parts_total + labor_total
    - Apply modifiers (discount, project management, project design)
    - Total = subtotal (after modifiers) + tax_amount
  
  2. Changes
    - Function now updates both subtotal and total fields
    - Includes all line items regardless of type
    - Applies modifiers from both proposals and proposal_settings tables
*/

CREATE OR REPLACE FUNCTION calculate_proposal_totals(p_proposal_id uuid)
RETURNS void AS $$
DECLARE
  v_parts_total numeric(10,2);
  v_labor_total numeric(10,2);
  v_subtotal numeric(10,2);
  v_running_total numeric(10,2);
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

  -- Get tax amount from proposal
  v_tax_amount := COALESCE(v_proposal_record.tax_amount, 0);

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

  -- Update proposal with all calculated values
  UPDATE proposals
  SET 
    parts_total = v_parts_total,
    labor_total = v_labor_total,
    subtotal = v_subtotal,
    total = v_total,
    deposit_amount_due = v_deposit_amount,
    updated_at = now()
  WHERE id = p_proposal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
