/*
  # Add Missing Tax Rate Column to Invoices

  1. Changes
    - Add tax_rate column to invoices table
    - This column stores the actual tax rate applied (e.g., 0.0935 for 9.35%)
    - Required for proper tax calculation and reporting

  2. Notes
    - This column was supposed to exist from earlier migration but is missing
    - Defaults to 0 for existing invoices
*/

-- Add tax_rate column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'invoices' 
    AND column_name = 'tax_rate'
  ) THEN
    ALTER TABLE invoices ADD COLUMN tax_rate decimal(5,4) DEFAULT 0;
    
    COMMENT ON COLUMN invoices.tax_rate IS 'Tax rate applied as decimal (e.g., 0.0935 for 9.35%)';
  END IF;
END $$;
