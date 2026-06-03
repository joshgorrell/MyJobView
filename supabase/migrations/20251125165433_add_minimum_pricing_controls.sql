/*
  # Add Minimum Pricing Controls

  1. Changes
    - Add `global_minimum_margin` to company_settings
    - Add `enforce_minimum_pricing` to company_settings
    - Add `labor_rate_per_hour` to company_settings (for labor calculations)

  2. Notes
    - Global minimum margin will apply to all products unless overridden
    - Individual products can have their own minimum margin/price
*/

-- Add minimum pricing settings to company_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'global_minimum_margin'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN global_minimum_margin numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'enforce_minimum_pricing'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN enforce_minimum_pricing boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'labor_rate_per_hour'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN labor_rate_per_hour numeric DEFAULT 100;
  END IF;
END $$;