/*
  # Add Credit Card Convenience Fee Settings

  1. Changes to `company_settings` table
    - Add `cc_convenience_fee_enabled` (boolean) - Whether to charge a convenience fee for credit card payments
    - Add `cc_convenience_fee_type` (text) - Either 'percentage' or 'flat'
    - Add `cc_convenience_fee_percentage` (numeric) - Percentage fee (e.g., 0.03 for 3%)
    - Add `cc_convenience_fee_flat_amount` (numeric) - Flat dollar amount fee
    - Add `cc_convenience_fee_label` (text) - Custom label for the fee line item (default: "Credit Card Convenience Fee")

  2. Notes
    - Admins can enable/disable the fee
    - Can be configured as either a percentage of the invoice amount or a flat fee
    - Only applies to credit card payments (not ACH, check, or cash)
    - The fee label is customizable
*/

-- Add convenience fee settings to company_settings
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'cc_convenience_fee_enabled'
  ) THEN
    ALTER TABLE company_settings 
    ADD COLUMN cc_convenience_fee_enabled boolean DEFAULT false,
    ADD COLUMN cc_convenience_fee_type text DEFAULT 'percentage' CHECK (cc_convenience_fee_type IN ('percentage', 'flat')),
    ADD COLUMN cc_convenience_fee_percentage numeric(5,4) DEFAULT 0.03,
    ADD COLUMN cc_convenience_fee_flat_amount numeric(10,2) DEFAULT 3.00,
    ADD COLUMN cc_convenience_fee_label text DEFAULT 'Credit Card Convenience Fee';
  END IF;
END $$;