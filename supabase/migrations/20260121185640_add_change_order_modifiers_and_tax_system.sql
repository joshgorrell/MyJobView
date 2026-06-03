/*
  # Add Modifier Support and Sales Tax Rules to Change Orders

  1. Problem
    - Change orders don't track pricing modifiers (discount, project management, etc.)
    - Tax calculation doesn't follow the sales tax rules matrix
    - No distinction between parts tax and labor tax
    - Line items don't distinguish between material and labor

  2. Solution
    - Add all modifier fields to change_orders table
    - Add tax environment and project type to inherit from sales order
    - Split tax into parts_tax and labor_tax
    - Add item_type and labor fields to change_order_line_items
    - Create calculate_change_order_totals() function

  3. New Tables
    - change_orders (enhanced):
      - parts_subtotal, labor_subtotal (material vs labor breakdown)
      - tax_environment, tax_project_type (inherited from proposal)
      - tax_rate (from contact or jurisdiction)
      - parts_tax, labor_tax (separate tax calculations)
      - Modifier fields: discount_percent, project_management_percent, etc.
      - Modifier amounts: discount_amount, project_management_amount, etc.
    
    - change_order_line_items (enhanced):
      - item_type (material, labor, or both)
      - labor_hours, labor_rate, labor_total
      - is_taxable (override flag)
*/

-- Add modifier and tax breakdown fields to change_orders
ALTER TABLE change_orders 
  ADD COLUMN IF NOT EXISTS parts_subtotal numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_subtotal numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_environment text,
  ADD COLUMN IF NOT EXISTS tax_project_type text,
  ADD COLUMN IF NOT EXISTS tax_rate numeric(5,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parts_tax numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_tax numeric(10,2) DEFAULT 0,
  
  -- Modifier selection flags
  ADD COLUMN IF NOT EXISTS apply_discount boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS apply_project_management boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS apply_project_design boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS apply_system_design boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS apply_credit_card_fee boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS apply_misc_parts boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS apply_custom_modifier_1 boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS apply_custom_modifier_2 boolean DEFAULT false,
  
  -- Modifier percentages (from proposal settings or custom)
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS project_management_percent numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS project_design_percent numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS system_design_percent numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_card_fee_percent numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS misc_parts_percent numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custom_modifier_1_percent numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custom_modifier_2_percent numeric(5,2) DEFAULT 0,
  
  -- Modifier calculated amounts (for audit trail)
  ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS project_management_amount numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS project_design_amount numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS system_design_amount numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_card_fee_amount numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS misc_parts_amount numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custom_modifier_1_amount numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custom_modifier_2_amount numeric(10,2) DEFAULT 0,
  
  -- Subtotal after modifiers (before tax)
  ADD COLUMN IF NOT EXISTS subtotal_after_modifiers numeric(10,2) DEFAULT 0;

-- Add item type and labor fields to change_order_line_items
ALTER TABLE change_order_line_items
  ADD COLUMN IF NOT EXISTS item_type text DEFAULT 'material',
  ADD COLUMN IF NOT EXISTS labor_hours numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_rate numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_total numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_taxable boolean DEFAULT true;

-- Add constraint for item_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'change_order_line_items_item_type_check'
  ) THEN
    ALTER TABLE change_order_line_items
      ADD CONSTRAINT change_order_line_items_item_type_check
      CHECK (item_type IN ('material', 'labor', 'both'));
  END IF;
END $$;

-- Create function to calculate change order totals
CREATE OR REPLACE FUNCTION calculate_change_order_totals(p_change_order_id uuid)
RETURNS void AS $$
DECLARE
  v_parts_total numeric(10,2) := 0;
  v_labor_total numeric(10,2) := 0;
  v_subtotal numeric(10,2) := 0;
  v_running_total numeric(10,2) := 0;
  v_tax_rate numeric(5,4) := 0;
  v_tax_environment text;
  v_tax_project_type text;
  v_parts_taxable boolean;
  v_labor_taxable boolean;
  v_parts_tax numeric(10,2) := 0;
  v_labor_tax numeric(10,2) := 0;
  v_tax_amount numeric(10,2) := 0;
  v_change_amount numeric(10,2) := 0;
  v_co_record record;
  v_original_contract numeric(10,2) := 0;
  
  -- Modifier variables
  v_discount_amount numeric(10,2) := 0;
  v_project_mgmt_amount numeric(10,2) := 0;
  v_project_design_amount numeric(10,2) := 0;
  v_system_design_amount numeric(10,2) := 0;
  v_credit_card_fee_amount numeric(10,2) := 0;
  v_misc_parts_amount numeric(10,2) := 0;
  v_custom_mod_1_amount numeric(10,2) := 0;
  v_custom_mod_2_amount numeric(10,2) := 0;
BEGIN
  -- Get change order data
  SELECT * INTO v_co_record
  FROM change_orders
  WHERE id = p_change_order_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Calculate parts total (from line items marked as material or both)
  SELECT COALESCE(SUM(
    CASE 
      WHEN item_type IN ('material', 'both') THEN COALESCE(new_total, 0)
      ELSE 0
    END
  ), 0)
  INTO v_parts_total
  FROM change_order_line_items
  WHERE change_order_id = p_change_order_id;

  -- Calculate labor total (from line items marked as labor or both, plus labor_total field)
  SELECT COALESCE(SUM(
    CASE 
      WHEN item_type = 'labor' THEN COALESCE(labor_total, 0)
      WHEN item_type = 'both' THEN COALESCE(labor_total, 0)
      ELSE 0
    END
  ), 0)
  INTO v_labor_total
  FROM change_order_line_items
  WHERE change_order_id = p_change_order_id;

  -- Calculate base subtotal
  v_subtotal := v_parts_total + v_labor_total;
  v_running_total := v_subtotal;

  -- Apply modifiers if enabled
  IF v_co_record.apply_discount AND v_co_record.discount_percent > 0 THEN
    v_discount_amount := v_subtotal * (v_co_record.discount_percent / 100);
    v_running_total := v_running_total - v_discount_amount;
  END IF;

  IF v_co_record.apply_project_management AND v_co_record.project_management_percent > 0 THEN
    v_project_mgmt_amount := v_subtotal * (v_co_record.project_management_percent / 100);
    v_running_total := v_running_total + v_project_mgmt_amount;
  END IF;

  IF v_co_record.apply_project_design AND v_co_record.project_design_percent > 0 THEN
    v_project_design_amount := v_subtotal * (v_co_record.project_design_percent / 100);
    v_running_total := v_running_total + v_project_design_amount;
  END IF;

  IF v_co_record.apply_system_design AND v_co_record.system_design_percent > 0 THEN
    v_system_design_amount := v_subtotal * (v_co_record.system_design_percent / 100);
    v_running_total := v_running_total + v_system_design_amount;
  END IF;

  IF v_co_record.apply_credit_card_fee AND v_co_record.credit_card_fee_percent > 0 THEN
    v_credit_card_fee_amount := v_subtotal * (v_co_record.credit_card_fee_percent / 100);
    v_running_total := v_running_total + v_credit_card_fee_amount;
  END IF;

  IF v_co_record.apply_misc_parts AND v_co_record.misc_parts_percent > 0 THEN
    v_misc_parts_amount := v_subtotal * (v_co_record.misc_parts_percent / 100);
    v_running_total := v_running_total + v_misc_parts_amount;
  END IF;

  IF v_co_record.apply_custom_modifier_1 AND v_co_record.custom_modifier_1_percent > 0 THEN
    v_custom_mod_1_amount := v_subtotal * (v_co_record.custom_modifier_1_percent / 100);
    v_running_total := v_running_total + v_custom_mod_1_amount;
  END IF;

  IF v_co_record.apply_custom_modifier_2 AND v_co_record.custom_modifier_2_percent > 0 THEN
    v_custom_mod_2_amount := v_subtotal * (v_co_record.custom_modifier_2_percent / 100);
    v_running_total := v_running_total + v_custom_mod_2_amount;
  END IF;

  -- Get tax configuration (from change order or default)
  v_tax_rate := COALESCE(v_co_record.tax_rate, 0);
  v_tax_environment := COALESCE(v_co_record.tax_environment, 'residential');
  v_tax_project_type := COALESCE(v_co_record.tax_project_type, 'general_installation_repair');

  -- Determine tax applicability based on environment and project type (follow same rules as proposals)
  v_parts_taxable := true;  -- Default: parts are taxable
  v_labor_taxable := false; -- Default: labor is not taxable

  -- Apply tax rules matrix
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

  -- Calculate tax amounts separately for parts and labor
  -- Split the adjusted total proportionally back to parts and labor
  IF v_subtotal > 0 THEN
    DECLARE
      v_parts_ratio numeric := v_parts_total / v_subtotal;
      v_labor_ratio numeric := v_labor_total / v_subtotal;
      v_adjusted_parts numeric := v_running_total * v_parts_ratio;
      v_adjusted_labor numeric := v_running_total * v_labor_ratio;
    BEGIN
      IF v_parts_taxable THEN
        v_parts_tax := v_adjusted_parts * v_tax_rate;
      END IF;

      IF v_labor_taxable THEN
        v_labor_tax := v_adjusted_labor * v_tax_rate;
      END IF;
    END;
  END IF;

  v_tax_amount := v_parts_tax + v_labor_tax;
  v_change_amount := v_running_total + v_tax_amount;

  -- Update change order with calculated values
  UPDATE change_orders
  SET 
    parts_subtotal = v_parts_total,
    labor_subtotal = v_labor_total,
    subtotal_after_modifiers = v_running_total,
    discount_amount = v_discount_amount,
    project_management_amount = v_project_mgmt_amount,
    project_design_amount = v_project_design_amount,
    system_design_amount = v_system_design_amount,
    credit_card_fee_amount = v_credit_card_fee_amount,
    misc_parts_amount = v_misc_parts_amount,
    custom_modifier_1_amount = v_custom_mod_1_amount,
    custom_modifier_2_amount = v_custom_mod_2_amount,
    parts_tax = v_parts_tax,
    labor_tax = v_labor_tax,
    tax_amount = v_tax_amount,
    change_amount = v_change_amount,
    new_contract_total = COALESCE(original_contract_amount, 0) + v_change_amount,
    updated_at = now()
  WHERE id = p_change_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION calculate_change_order_totals TO authenticated;
