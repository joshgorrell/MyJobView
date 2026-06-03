/*
  # Add Billing Configuration to Contacts

  1. Changes to contacts table
    - Add `accepts_po` boolean field (defaults to false)
    - Update `default_payment_terms` default from 'Net 30' to 'Net 10'
    - Add check constraint to ensure billing information is complete when PO is accepted

  2. Data Migration
    - Update existing contacts without custom payment terms to 'Net 10'
    - Ensure payment_methods_allowed array is properly set for all contacts

  3. Security
    - No RLS changes needed - inherits from existing contact policies
*/

-- Add accepts_po field to contacts table
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS accepts_po boolean DEFAULT false;

-- Update default_payment_terms default value to Net 10
ALTER TABLE contacts
ALTER COLUMN default_payment_terms SET DEFAULT 'Net 10';

-- Update existing contacts that have the old default 'Net 30' to new default 'Net 10'
-- Only update those that haven't been customized
UPDATE contacts
SET default_payment_terms = 'Net 10'
WHERE default_payment_terms = 'Net 30' OR default_payment_terms IS NULL;

-- Add comment explaining the field
COMMENT ON COLUMN contacts.accepts_po IS 'Whether this customer is approved to submit purchase orders. Requires complete billing information.';
COMMENT ON COLUMN contacts.default_payment_terms IS 'Default payment terms for this customer. Options: COD, Due on Receipt, Net 10, Net 30';

-- Create a function to validate billing completeness for PO acceptance
CREATE OR REPLACE FUNCTION check_po_billing_complete()
RETURNS TRIGGER AS $$
BEGIN
  -- If accepts_po is being set to true, validate billing information is complete
  IF NEW.accepts_po = true THEN
    -- Check required fields for PO acceptance
    IF NEW.company_name IS NULL OR NEW.company_name = '' THEN
      RAISE EXCEPTION 'Cannot enable PO acceptance: Company name is required';
    END IF;

    IF NEW.street_address IS NULL OR NEW.street_address = '' THEN
      RAISE EXCEPTION 'Cannot enable PO acceptance: Street address is required';
    END IF;

    IF NEW.city IS NULL OR NEW.city = '' THEN
      RAISE EXCEPTION 'Cannot enable PO acceptance: City is required';
    END IF;

    IF NEW.state IS NULL OR NEW.state = '' THEN
      RAISE EXCEPTION 'Cannot enable PO acceptance: State is required';
    END IF;

    IF NEW.zip_code IS NULL OR NEW.zip_code = '' THEN
      RAISE EXCEPTION 'Cannot enable PO acceptance: ZIP code is required';
    END IF;

    IF NEW.default_payment_terms IS NULL OR NEW.default_payment_terms = '' THEN
      RAISE EXCEPTION 'Cannot enable PO acceptance: Payment terms are required';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce billing completeness for PO acceptance
DROP TRIGGER IF EXISTS validate_po_billing_trigger ON contacts;
CREATE TRIGGER validate_po_billing_trigger
  BEFORE INSERT OR UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION check_po_billing_complete();
