/*
  # Sales Target Management System

  ## Summary
  Adds comprehensive sales target management with yearly escalation tracking.

  ## Changes Made
  1. **New Columns**
     - `yearly_escalation_percentage` - Target percentage increase over previous year
     - `sales_target_start_date` - When the current target period started
     - `previous_year_sales` - Last year's total sales for comparison

  ## Important Notes
  - Enables admins to set individual rep targets with automatic year-over-year growth tracking
  - Supports "beat last year by X%" goal setting
*/

-- Add sales target management columns to profiles
DO $$
BEGIN
  -- Yearly escalation percentage (e.g., 5% = 5.00)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'yearly_escalation_percentage'
  ) THEN
    ALTER TABLE profiles ADD COLUMN yearly_escalation_percentage numeric(5, 2) DEFAULT 0;
  END IF;

  -- Track when the current target period started
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'sales_target_start_date'
  ) THEN
    ALTER TABLE profiles ADD COLUMN sales_target_start_date timestamptz DEFAULT now();
  END IF;

  -- Store previous year sales for comparison
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'previous_year_sales'
  ) THEN
    ALTER TABLE profiles ADD COLUMN previous_year_sales numeric(15, 2) DEFAULT 0;
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN profiles.monthly_sales_target IS 'Monthly sales target amount for this rep';
COMMENT ON COLUMN profiles.yearly_escalation_percentage IS 'Year-over-year growth target (e.g., 5.00 = 5% increase)';
COMMENT ON COLUMN profiles.sales_target_start_date IS 'When the current target period started';
COMMENT ON COLUMN profiles.previous_year_sales IS 'Total sales from previous year for comparison';