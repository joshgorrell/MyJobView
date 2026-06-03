/*
  # Add Payment Processor Configuration to Organizations

  ## Summary
  Adds payment processor configuration columns to the organizations table,
  allowing each tenant admin to configure exactly one payment processor for
  handling credit card and ACH payments on invoices.

  ## Supported Processors
  - QuickBooks Online (uses existing OAuth connection)
  - Stripe (separate from platform billing Stripe)
  - Bill.com

  ## New Columns on organizations
  - `payment_processor` - Which processor is active (quickbooks, stripe, bill_com, or null)
  - `stripe_invoice_publishable_key` - Stripe publishable key for invoice payments
  - `stripe_invoice_secret_key` - Stripe secret key for invoice payments
  - `bill_com_org_id` - Bill.com organization ID
  - `bill_com_api_key` - Bill.com API key
  - `payment_processor_updated_at` - Timestamp of last processor config change (audit)

  ## Security
  - RLS already exists on organizations table (org-scoped)
  - Only admins/managers can update organization settings
  - No changes to existing RLS policies needed
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'payment_processor'
  ) THEN
    ALTER TABLE organizations ADD COLUMN payment_processor text
      CHECK (payment_processor IN ('quickbooks', 'stripe', 'bill_com'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'stripe_invoice_publishable_key'
  ) THEN
    ALTER TABLE organizations ADD COLUMN stripe_invoice_publishable_key text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'stripe_invoice_secret_key'
  ) THEN
    ALTER TABLE organizations ADD COLUMN stripe_invoice_secret_key text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'bill_com_org_id'
  ) THEN
    ALTER TABLE organizations ADD COLUMN bill_com_org_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'bill_com_api_key'
  ) THEN
    ALTER TABLE organizations ADD COLUMN bill_com_api_key text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'payment_processor_updated_at'
  ) THEN
    ALTER TABLE organizations ADD COLUMN payment_processor_updated_at timestamptz;
  END IF;
END $$;
