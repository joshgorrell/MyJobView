/*
# Allow labor on customer-supplied line items

## Purpose
Previously, marking a line item as "Customer Supplied" forced ALL pricing
to zero — including labor hours, labor rate, and labor total. This meant
reps could not bill labor for installing a customer-provided item.

This migration changes the behavior so customer-supplied items only zero
out **material** pricing (unit_price, line_total, cost). Labor fields
(labor_hours, labor_rate, labor_total) remain editable and are included
in proposal totals.

## Changes

### 1. Updated trigger: auto_compute_line_item_totals
- When `is_customer_supplied = true`, only force `unit_price = 0`,
  `line_total = 0`, `cost = 0`. Labor fields are left untouched so reps
  can enter labor hours, rate, and phase for installation.

### 2. Updated trigger: calculate_proposal_line_item_labor
- No longer zeroes labor when `is_customer_supplied = true`. Computes
  labor_total normally from labor_hours * quantity * labor_rate.

### 3. Updated function: calculate_proposal_totals
- Parts total query: still excludes customer-supplied items (unchanged).
- Labor total query: now INCLUDES customer-supplied items' labor,
  so labor on a customer-supplied item contributes to subtotal, tax,
  modifiers, and deposit.

### 4. Backfill
- Recalculate all existing proposal totals so any customer-supplied
  items with previously-zeroed labor are now correctly counted.
*/

-- Step 1: Update auto_compute_line_item_totals to only zero material fields
CREATE OR REPLACE FUNCTION auto_compute_line_item_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If customer-supplied, force only material pricing to zero; labor stays editable
  IF NEW.is_customer_supplied = true THEN
    NEW.unit_price  := 0;
    NEW.line_total  := 0;
    NEW.cost        := 0;
    -- Still compute labor_total if labor fields are set
    IF NEW.labor_hours IS NOT NULL AND NEW.labor_hours > 0
       AND NEW.labor_rate IS NOT NULL AND NEW.labor_rate > 0
    THEN
      NEW.labor_total := NEW.labor_hours * COALESCE(NEW.quantity, 1) * NEW.labor_rate;
    END IF;
    RETURN NEW;
  END IF;

  -- Auto-compute line_total if unit_price is set but line_total is missing/zero
  IF NEW.unit_price IS NOT NULL AND NEW.unit_price > 0
     AND NEW.quantity IS NOT NULL AND NEW.quantity > 0
     AND (NEW.line_total IS NULL OR NEW.line_total = 0)
  THEN
    NEW.line_total := NEW.quantity * NEW.unit_price;
  END IF;

  -- Auto-compute labor_total if labor_hours and labor_rate are set but labor_total is missing/zero
  IF NEW.labor_hours IS NOT NULL AND NEW.labor_hours > 0
     AND NEW.labor_rate IS NOT NULL AND NEW.labor_rate > 0
     AND (NEW.labor_total IS NULL OR NEW.labor_total = 0)
  THEN
    NEW.labor_total := NEW.labor_hours * COALESCE(NEW.quantity, 1) * NEW.labor_rate;
  END IF;

  RETURN NEW;
END;
$$;

-- Step 2: Update calculate_proposal_line_item_labor to NOT zero labor for customer-supplied
CREATE OR REPLACE FUNCTION calculate_proposal_line_item_labor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Compute labor normally regardless of is_customer_supplied
  IF NEW.labor_hours IS NOT NULL AND NEW.labor_rate IS NOT NULL THEN
    NEW.labor_total := NEW.labor_hours * COALESCE(NEW.quantity, 1) * NEW.labor_rate;
  ELSE
    NEW.labor_total := 0;
  END IF;

  RETURN NEW;
END;
$$;

-- Step 3: Update calculate_proposal_totals to include customer-supplied labor
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

  v_parts_taxable := true;
  v_labor_taxable := true;

  IF v_tax_environment = 'residential' AND v_tax_project_type = 'original_construction' THEN
    v_parts_taxable := true;
    v_labor_taxable := false;
  ELSIF v_tax_environment = 'residential' AND v_tax_project_type = 'remodel' THEN
    v_parts_taxable := true;
    v_labor_taxable := false;
  ELSIF v_tax_environment = 'residential' AND v_tax_project_type = 'general_installation_repair' THEN
    v_parts_taxable := true;
    v_labor_taxable := true;
  ELSIF v_tax_environment = 'commercial' AND v_tax_project_type = 'original_construction' THEN
    v_parts_taxable := true;
    v_labor_taxable := false;
  ELSIF v_tax_environment = 'commercial' AND v_tax_project_type = 'remodel' THEN
    v_parts_taxable := true;
    v_labor_taxable := true;
  ELSIF v_tax_environment = 'commercial' AND v_tax_project_type = 'general_installation_repair' THEN
    v_parts_taxable := true;
    v_labor_taxable := true;
  ELSIF v_tax_project_type IN ('maintenance_agreement', 'membership') THEN
    v_parts_taxable := true;
    v_labor_taxable := true;
  ELSIF v_tax_project_type IN ('exempt_project', 'design_services', 'security_monitoring') THEN
    v_parts_taxable := false;
    v_labor_taxable := false;
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
    updated_at = now()
  WHERE id = p_proposal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Recalculate all existing proposals
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
