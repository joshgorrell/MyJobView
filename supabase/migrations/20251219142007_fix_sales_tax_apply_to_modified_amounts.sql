/*
  # Fix Sales Tax - Apply Tax to Modified Amounts

  1. Problem
    - Tax is calculated on raw parts_total and labor_total BEFORE modifiers
    - Modifiers (discounts, fees) are applied AFTER tax calculation
    - This causes incorrect tax amounts - fees should be taxed, discounts should reduce tax
    - Footer totals don't match tax report because modifiers aren't being taxed

  2. Solution
    - Apply modifiers proportionally to parts and labor
    - Calculate tax on the MODIFIED parts and labor amounts
    - This ensures tax is calculated on the final sale price as required by Texas law

  3. Logic
    - Calculate parts_total and labor_total from line items
    - Apply modifiers proportionally to both parts and labor
    - Calculate tax on modified parts and labor amounts
    - Sum up to get final total

  4. Example
    Before: Parts $1000 + Labor $500 = $1500
            Tax on $1500 = $135 (9%)
            Add 10% project mgmt = $150
            Total = $1500 + $135 + $150 = $1785 (incorrect - fee not taxed)

    After:  Parts $1000 + Labor $500 = $1500
            Add 10% project mgmt = $150 (proportionally: $100 parts, $50 labor)
            Modified parts = $1100, Modified labor = $550
            Tax on $1650 = $148.50 (9%)
            Total = $1650 + $148.50 = $1798.50 (correct - fee is taxed)
*/

CREATE OR REPLACE FUNCTION calculate_proposal_totals(p_proposal_id uuid)
RETURNS void AS $$
DECLARE
  v_parts_total numeric(10,2);
  v_labor_total numeric(10,2);
  v_subtotal numeric(10,2);
  v_modified_parts numeric(10,2);
  v_modified_labor numeric(10,2);
  v_modified_subtotal numeric(10,2);
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
  v_net_modifier_percent numeric;
  v_parts_ratio numeric;
  v_labor_ratio numeric;
  v_proposal_record record;
BEGIN
  -- Get proposal data
  SELECT * INTO v_proposal_record
  FROM proposals
  WHERE id = p_proposal_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Calculate parts total (sum of line_total for material items only)
  SELECT COALESCE(SUM(line_total), 0)
  INTO v_parts_total
  FROM proposal_line_items
  WHERE proposal_id = p_proposal_id
    AND COALESCE(item_type, 'part') != 'labor';

  -- Calculate labor total
  -- For labor-only items: use line_total or labor_total
  -- For material items: use labor_total only
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

  -- Calculate subtotal
  v_subtotal := v_parts_total + v_labor_total;

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

  -- Calculate modifier amounts (for display purposes)
  v_discount_amount := v_subtotal * (v_discount_percent / 100);
  v_project_mgmt_amount := v_subtotal * (v_project_mgmt_percent / 100);
  v_project_design_amount := v_subtotal * (v_project_design_percent / 100);
  v_system_design_amount := v_subtotal * (v_system_design_percent / 100);
  v_credit_card_fee_amount := v_subtotal * (v_credit_card_fee_percent / 100);
  v_misc_parts_amount := v_subtotal * (v_misc_parts_percent / 100);
  v_custom_mod_1_amount := v_subtotal * (v_custom_mod_1_percent / 100);
  v_custom_mod_2_amount := v_subtotal * (v_custom_mod_2_percent / 100);

  -- Calculate net modifier percentage (negative for discounts, positive for fees)
  v_net_modifier_percent :=
    -v_discount_percent
    + v_project_mgmt_percent
    + v_project_design_percent
    + v_system_design_percent
    + v_credit_card_fee_percent
    + v_misc_parts_percent
    + v_custom_mod_1_percent
    + v_custom_mod_2_percent;

  -- Apply modifiers proportionally to parts and labor
  -- This ensures both parts and labor get the same percentage adjustment
  v_modified_parts := v_parts_total * (1 + v_net_modifier_percent / 100);
  v_modified_labor := v_labor_total * (1 + v_net_modifier_percent / 100);
  v_modified_subtotal := v_modified_parts + v_modified_labor;

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

  -- Calculate tax amounts separately for MODIFIED parts and labor
  IF v_parts_taxable THEN
    v_parts_tax := v_modified_parts * v_tax_rate;
  ELSE
    v_parts_tax := 0;
  END IF;

  IF v_labor_taxable THEN
    v_labor_tax := v_modified_labor * v_tax_rate;
  ELSE
    v_labor_tax := 0;
  END IF;

  -- Total tax is sum of parts tax and labor tax
  v_tax_amount := v_parts_tax + v_labor_tax;

  -- Calculate final total (modified subtotal + tax)
  v_total := v_modified_subtotal + v_tax_amount;

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

  -- Update proposal with all calculated values including ALL modifier amounts
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
    updated_at = now()
  WHERE id = p_proposal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recalculate all existing proposals with correct tax amounts
DO $$
DECLARE
  proposal_rec RECORD;
BEGIN
  FOR proposal_rec IN
    SELECT id FROM proposals WHERE is_revision = false
  LOOP
    PERFORM calculate_proposal_totals(proposal_rec.id);
  END LOOP;
END $$;
