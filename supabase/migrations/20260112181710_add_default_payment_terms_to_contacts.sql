/*
  # Add Default Payment Terms to Contacts

  1. Changes
    - Add `default_payment_terms` field to contacts table
    - This will be used as the default when creating proposals/invoices for this customer

  2. Details
    - Field is optional (can be null)
    - Common values: "Net 30", "Net 15", "Due on Receipt", "50% Deposit, Balance on Completion", etc.
    - When creating a proposal/invoice, this value will pre-populate the payment terms
*/

-- Add default payment terms to contacts
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'default_payment_terms'
  ) THEN
    ALTER TABLE contacts ADD COLUMN default_payment_terms text;
  END IF;
END $$;

COMMENT ON COLUMN contacts.default_payment_terms IS 'Default payment terms for this customer (e.g., "Net 30", "Due on Receipt", etc.)';
