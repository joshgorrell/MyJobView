/*
  # Add Tax Rate to Contacts

  1. Changes
    - Add `tax_rate` column to contacts table to store the applicable tax rate
    - This rate can be auto-populated from zip code lookup or manually entered
    - If contact is tax_exempt, the rate should be 0 or null

  2. Notes
    - Contact tax status now includes:
      - `is_tax_exempt` (boolean) - whether contact is exempt
      - `tax_exemption_reason` (text) - reason for exemption
      - `tax_rate` (decimal) - applicable tax rate for this contact
*/

-- Add tax_rate column to contacts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'tax_rate'
  ) THEN
    ALTER TABLE contacts ADD COLUMN tax_rate decimal(5,4) DEFAULT NULL;
  END IF;
END $$;

-- Add comment to explain the column
COMMENT ON COLUMN contacts.tax_rate IS 'Sales tax rate applicable for this contact. Auto-populated from zip code or manually entered. NULL or 0 if tax exempt.';
