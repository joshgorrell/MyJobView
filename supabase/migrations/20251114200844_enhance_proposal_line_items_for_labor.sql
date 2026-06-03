/*
  # Enhance Proposal Line Items for Labor Tracking

  1. Changes
    - Add `labor_hours` column to proposal_line_items
    - Add `labor_rate` column to store hourly rate
    - Add `labor_total` column for calculated labor cost
    - Add `margin_percent` calculated field for internal tracking
    - These fields support the proposal builder's margin tracking features

  2. Notes
    - labor_hours is optional (nullable)
    - labor_rate defaults to 0
    - labor_total is calculated: labor_hours * labor_rate
    - margin_percent is for display purposes: ((unit_price - cost) / unit_price * 100)
*/

DO $$
BEGIN
  -- Add labor_hours if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_line_items' AND column_name = 'labor_hours'
  ) THEN
    ALTER TABLE proposal_line_items ADD COLUMN labor_hours numeric(10,2);
  END IF;

  -- Add labor_rate if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_line_items' AND column_name = 'labor_rate'
  ) THEN
    ALTER TABLE proposal_line_items ADD COLUMN labor_rate numeric(10,2) DEFAULT 0;
  END IF;

  -- Add labor_total if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_line_items' AND column_name = 'labor_total'
  ) THEN
    ALTER TABLE proposal_line_items ADD COLUMN labor_total numeric(10,2) DEFAULT 0;
  END IF;
END $$;

-- Function to calculate labor total
CREATE OR REPLACE FUNCTION calculate_proposal_line_item_labor()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate labor total if labor_hours is set
  IF NEW.labor_hours IS NOT NULL AND NEW.labor_rate IS NOT NULL THEN
    NEW.labor_total := NEW.labor_hours * NEW.labor_rate;
  ELSE
    NEW.labor_total := 0;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-calculate labor total
DROP TRIGGER IF EXISTS trigger_calculate_labor_total ON proposal_line_items;
CREATE TRIGGER trigger_calculate_labor_total
  BEFORE INSERT OR UPDATE ON proposal_line_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_proposal_line_item_labor();
