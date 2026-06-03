/*
  # Enhance Products Table

  1. Changes
    - Add `vendor` column for tracking product suppliers
    - Add `internal_notes` column for staff-only notes
    - These fields already exist in products table based on schema review,
      but we'll ensure they're there with proper defaults

  2. Notes
    - vendor is text field (supplier/manufacturer name)
    - internal_notes is for staff only (not shown to customers)
*/

DO $$
BEGIN
  -- Add vendor if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'vendor'
  ) THEN
    ALTER TABLE products ADD COLUMN vendor text;
  END IF;

  -- Add internal_notes if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'internal_notes'
  ) THEN
    ALTER TABLE products ADD COLUMN internal_notes text;
  END IF;
END $$;
