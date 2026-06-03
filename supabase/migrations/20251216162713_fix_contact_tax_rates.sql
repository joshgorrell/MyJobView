/*
  # Fix Contact Tax Rates

  1. Changes
    - Corrects any tax_rate values in contacts table that are greater than 1.0
    - Converts percentage values (e.g., 9.35) to decimal values (e.g., 0.0935)
    - Only affects tax rates between 1.0 and 100.0 (excludes already correct values)

  2. Notes
    - This fixes an issue where tax rates were entered as percentages instead of decimals
    - Tax rates should be stored as decimals (0.0935 for 9.35%)
    - The UI now properly converts percentage input to decimal storage
*/

-- Fix any tax rates that are stored as percentages instead of decimals
-- Only fix values between 1.0 and 100.0 (anything > 100 is likely an error that needs manual review)
UPDATE contacts
SET tax_rate = tax_rate / 100
WHERE tax_rate > 1.0 AND tax_rate <= 100.0;
