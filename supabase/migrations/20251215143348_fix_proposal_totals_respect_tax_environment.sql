/*
  # Fix Proposal Totals to Respect Tax Environment and Project Type

  1. Problem
    - The calculate_proposal_totals function applies tax rate uniformly to entire running total
    - It doesn't respect tax_environment and tax_project_type settings
    - Parts and labor should be taxed differently based on these settings

  2. Solution
    - Update function to calculate parts tax and labor tax separately
    - Apply Texas tax rules based on environment and project type:
      * Residential Original Construction: Parts taxable, Labor not taxable
      * Residential Remodel: Parts taxable, Labor not taxable
      * Residential General Installation/Repair: Parts taxable, Labor taxable
      * Commercial Original Construction: Parts taxable, Labor not taxable
      * Commercial Remodel: Parts taxable, Labor taxable
      * Commercial General Installation/Repair: Parts taxable, Labor taxable
      * Maintenance/Membership: Both taxable
      * Exempt/Design/Monitoring: Neither taxable

  3. Changes
    - Calculate parts_tax and labor_tax separately based on tax applicability
    - Store total tax_amount as parts_tax + labor_tax
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

  -- Get tax configuration
  v_tax_rate := COALESCE(v_proposal_record.tax_rate, 0);
  v_tax_environment := COALESCE(v_proposal_record.tax_environment, 'residential');
  v_tax_project_type := COALESCE(v_proposal_record.tax_project_type, 'general_installation_repair');

  -- Determine tax applicability based on environment and project type (Texas rules)
  v_parts_taxable := true;  -- Default
  v_labor_taxable := true;  -- Default

  -- Residential Original Construction: Parts taxable, Labor not taxable
  IF v_tax_environment = 'residential' AND v_tax_project_type = 'original_construction' THEN
    v_parts_taxable := true;
    v_labor_taxable := false;
  
  -- Residential Remodel: Parts taxable, Labor not taxable
  ELSIF v_tax_environment = 'residential' AND v_tax_project_type = 'remodel' THEN
    v_parts_taxable := true;
    v_labor_taxable := false;
  
  -- Residential General Installation/Repair: Both taxable
  ELSIF v_tax_environment = 'residential' AND v_tax_project_type = 'general_installation_repair' THEN
    v_parts_taxable := true;
    v_labor_taxable := true;
  
  -- Commercial Original Construction: Parts taxable, Labor not taxable
  ELSIF v_tax_environment = 'commercial' AND v_tax_project_type = 'original_construction' THEN
    v_parts_taxable := true;
    v_labor_taxable := false;
  
  -- Commercial Remodel: Both taxable
  ELSIF v_tax_environment = 'commercial' AND v_tax_project_type = 'remodel' THEN
    v_parts_taxable := true;
    v_labor_taxable := true;
  
  -- Commercial General Installation/Repair: Both taxable
  ELSIF v_tax_environment = 'commercial' AND v_tax_project_type = 'general_installation_repair' THEN
    v_parts_taxable := true;
    v_labor_taxable := true;
  
  -- Maintenance/Membership: Both taxable
  ELSIF v_tax_project_type IN ('maintenance_agreement', 'membership') THEN
    v_parts_taxable := true;
    v_labor_taxable := true;
  
  -- Exempt/Design/Monitoring: Neither taxable
  ELSIF v_tax_project_type IN ('exempt_project', 'design_services', 'security_monitoring') THEN
    v_parts_taxable := false;
    v_labor_taxable := false;
  END IF;

  -- Calculate tax amounts separately for parts and labor
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

  -- Total tax is sum of parts tax and labor tax
  v_tax_amount := v_parts_tax + v_labor_tax;

  -- Calculate final total (running total includes modifiers but not tax yet)
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