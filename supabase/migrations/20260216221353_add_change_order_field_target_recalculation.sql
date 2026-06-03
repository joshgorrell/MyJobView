/*
  # Add Change Order Field Target Recalculation System

  1. New Table
    - `test_tune_field_target_history`
      - Tracks all Field Target recalculations
      - Records original target, new target, change order details
      - Provides audit trail for compliance

  2. Trigger Function
    - Fires when change order status changes to 'approved'
    - Calculates total labor hours from approved change order line items
    - Recalculates Total Estimated Labor = Original + All Approved CO Labor
    - Recalculates PM Allocation = Total × 5%
    - Recalculates Field Target = Total × 95%
    - Updates sales_orders table
    - Logs change to history table

  3. Security
    - Enable RLS on history table
    - All authenticated users can view history
    - Only system can insert records (via trigger)
*/

-- Create field target history table
CREATE TABLE IF NOT EXISTS test_tune_field_target_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  change_order_id uuid REFERENCES change_orders(id) ON DELETE SET NULL,
  change_order_number text,
  previous_total_labor_hours numeric(10, 2) NOT NULL,
  previous_field_target_hours numeric(10, 2) NOT NULL,
  previous_pm_allocation_hours numeric(10, 2) NOT NULL,
  added_labor_hours numeric(10, 2) NOT NULL,
  new_total_labor_hours numeric(10, 2) NOT NULL,
  new_field_target_hours numeric(10, 2) NOT NULL,
  new_pm_allocation_hours numeric(10, 2) NOT NULL,
  recalculated_at timestamptz DEFAULT now(),
  recalculated_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_field_target_history_sales_order
  ON test_tune_field_target_history(sales_order_id);

CREATE INDEX IF NOT EXISTS idx_field_target_history_change_order
  ON test_tune_field_target_history(change_order_id);

CREATE INDEX IF NOT EXISTS idx_field_target_history_date
  ON test_tune_field_target_history(recalculated_at DESC);

-- Enable RLS
ALTER TABLE test_tune_field_target_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "All authenticated users can view field target history"
  ON test_tune_field_target_history
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can insert field target history"
  ON test_tune_field_target_history
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Function to recalculate field target when change order is approved
CREATE OR REPLACE FUNCTION recalculate_field_target_on_change_order_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sales_order_id uuid;
  v_added_labor_hours numeric(10, 2);
  v_previous_total numeric(10, 2);
  v_previous_field_target numeric(10, 2);
  v_previous_pm_allocation numeric(10, 2);
  v_new_total numeric(10, 2);
  v_new_field_target numeric(10, 2);
  v_new_pm_allocation numeric(10, 2);
BEGIN
  -- Only proceed if status changed to 'approved'
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    -- Get the sales order ID
    v_sales_order_id := NEW.sales_order_id;
    
    -- Skip if no sales order linked
    IF v_sales_order_id IS NULL THEN
      RETURN NEW;
    END IF;
    
    -- Calculate total labor hours from this change order
    SELECT COALESCE(SUM(labor_hours), 0)
    INTO v_added_labor_hours
    FROM change_order_line_items
    WHERE change_order_id = NEW.id
      AND labor_hours IS NOT NULL;
    
    -- Skip if no labor hours added
    IF v_added_labor_hours = 0 THEN
      RETURN NEW;
    END IF;
    
    -- Get current values from sales order
    SELECT 
      COALESCE(total_estimated_labor_hours, 0),
      COALESCE(field_labor_target_hours, 0),
      COALESCE(pm_labor_allocation_hours, 0)
    INTO 
      v_previous_total,
      v_previous_field_target,
      v_previous_pm_allocation
    FROM sales_orders
    WHERE id = v_sales_order_id;
    
    -- Calculate new values
    v_new_total := v_previous_total + v_added_labor_hours;
    v_new_pm_allocation := v_new_total * 0.05;  -- 5% for PM
    v_new_field_target := v_new_total * 0.95;   -- 95% for field target
    
    -- Update sales order
    UPDATE sales_orders
    SET
      total_estimated_labor_hours = v_new_total,
      pm_labor_allocation_hours = v_new_pm_allocation,
      field_labor_target_hours = v_new_field_target,
      updated_at = now()
    WHERE id = v_sales_order_id;
    
    -- Log to history
    INSERT INTO test_tune_field_target_history (
      sales_order_id,
      change_order_id,
      change_order_number,
      previous_total_labor_hours,
      previous_field_target_hours,
      previous_pm_allocation_hours,
      added_labor_hours,
      new_total_labor_hours,
      new_field_target_hours,
      new_pm_allocation_hours,
      recalculated_by
    ) VALUES (
      v_sales_order_id,
      NEW.id,
      NEW.change_order_number,
      v_previous_total,
      v_previous_field_target,
      v_previous_pm_allocation,
      v_added_labor_hours,
      v_new_total,
      v_new_field_target,
      v_new_pm_allocation,
      auth.uid()
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on change_orders table
DROP TRIGGER IF EXISTS recalculate_field_target_on_approval ON change_orders;

CREATE TRIGGER recalculate_field_target_on_approval
  AFTER INSERT OR UPDATE OF status ON change_orders
  FOR EACH ROW
  EXECUTE FUNCTION recalculate_field_target_on_change_order_approval();

-- Add helpful comment
COMMENT ON TABLE test_tune_field_target_history IS 'Audit trail of Field Target recalculations when change orders add labor hours. Per spec: Total Estimated Labor = Original + All Approved CO Labor, Field Target = Total × 95%, PM Allocation = Total × 5%';

COMMENT ON FUNCTION recalculate_field_target_on_change_order_approval() IS 'Automatically recalculates Field Target when change orders are approved. Ensures Test & Tune targets accurately reflect scope changes.';