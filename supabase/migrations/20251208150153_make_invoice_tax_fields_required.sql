/*
  # Make Invoice Tax Classification Fields Required

  1. Changes
    - Make tax_environment and tax_project_type required on invoices table
    - These fields are critical for sales tax calculation based on the tax matrix
    - Set default values for any existing records before making NOT NULL

  2. Notes
    - Invoices from proposals/sales orders inherit these values automatically
    - Service invoices and one-off invoices must capture these at creation time
    - This ensures all invoices can properly calculate sales tax
*/

-- Set default values for any existing invoices that don't have these values
UPDATE invoices
SET tax_environment = 'residential'
WHERE tax_environment IS NULL;

UPDATE invoices
SET tax_project_type = 'general_installation_repair'
WHERE tax_project_type IS NULL;

-- Make the fields NOT NULL
ALTER TABLE invoices
ALTER COLUMN tax_environment SET NOT NULL;

ALTER TABLE invoices
ALTER COLUMN tax_project_type SET NOT NULL;
