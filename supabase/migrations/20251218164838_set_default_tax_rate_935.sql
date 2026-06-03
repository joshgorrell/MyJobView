/*
  # Set Default Tax Rate to 9.35% for Contacts

  1. Changes
    - Update default_tax_rate column default value from 0 to 9.35 (0.0935)
    - Update existing company_settings records with 0 or NULL to 9.35

  2. Notes
    - This ensures new contacts get 9.35% tax rate by default
    - Can be overridden by user input or ZIP-based tax lookup
*/

-- Update the default value for the column
ALTER TABLE company_settings
ALTER COLUMN default_tax_rate SET DEFAULT 9.35;

-- Update existing records that have 0 or NULL
UPDATE company_settings
SET default_tax_rate = 9.35
WHERE default_tax_rate = 0 OR default_tax_rate IS NULL;
