/*
  # Add Labor Cost Field for Profit Margin Calculations

  1. Changes
    - Add `default_cost` column to `labor_phases` table
    - Rename `default_rate` to `default_price` for clarity (rate = customer price)
    - Add check constraint to ensure cost <= price for data validation
  
  2. Purpose
    - Track internal labor cost (what company pays)
    - Track customer price (what company charges)
    - Enable accurate profit margin calculations in reports and proposals
    
  3. Notes
    - Existing `default_rate` values will be preserved as `default_price`
    - `default_cost` starts at 0, admins should update with actual costs
    - Profit margin = (price - cost) / price * 100
*/

-- Add the cost column
ALTER TABLE labor_phases 
ADD COLUMN IF NOT EXISTS default_cost numeric DEFAULT 0;

-- Rename default_rate to default_price for clarity
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'labor_phases' 
    AND column_name = 'default_rate'
  ) THEN
    ALTER TABLE labor_phases RENAME COLUMN default_rate TO default_price;
  END IF;
END $$;

-- Add check constraint to ensure cost is not greater than price
ALTER TABLE labor_phases
DROP CONSTRAINT IF EXISTS labor_phases_cost_not_greater_than_price;

ALTER TABLE labor_phases
ADD CONSTRAINT labor_phases_cost_not_greater_than_price 
CHECK (default_cost <= default_price);

-- Add comment for documentation
COMMENT ON COLUMN labor_phases.default_cost IS 'Internal labor cost - what the company pays employees/contractors per hour';
COMMENT ON COLUMN labor_phases.default_price IS 'Customer-facing price - what the company charges customers per hour';
