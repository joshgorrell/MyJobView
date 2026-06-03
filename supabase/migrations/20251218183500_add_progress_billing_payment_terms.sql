/*
  # Add Progress Billing and Payment Terms Configuration

  1. Changes to proposal_settings
    - Add `progress_billing_type` - 'monthly', 'completion', 'none'
    - Add `progress_invoice_terms` - 'net_10', 'net_30', 'net_45', 'net_60', 'due_on_receipt'
    - Add `balance_payment_terms` - Custom text for when final balance is due

  2. Business Logic
    - Deposit is always due upon acceptance
    - Progress invoices follow the terms specified (Net 10, Net 30, etc.)
    - Balance can have custom terms or default to "upon completion"
    - Sales reps configure per proposal

  3. Security
    - Maintain existing RLS policies
*/

-- Add progress billing configuration to proposal_settings
ALTER TABLE proposal_settings
  ADD COLUMN IF NOT EXISTS progress_billing_type text DEFAULT 'completion'
  CHECK (progress_billing_type IN ('monthly', 'completion', 'none'));

ALTER TABLE proposal_settings
  ADD COLUMN IF NOT EXISTS progress_invoice_terms text DEFAULT 'net_30'
  CHECK (progress_invoice_terms IN ('net_10', 'net_30', 'net_45', 'net_60', 'due_on_receipt'));

ALTER TABLE proposal_settings
  ADD COLUMN IF NOT EXISTS balance_payment_terms text DEFAULT 'Upon project completion';

-- Add comments for clarity
COMMENT ON COLUMN proposal_settings.progress_billing_type IS 'How progress invoices are issued: monthly, at completion, or none';
COMMENT ON COLUMN proposal_settings.progress_invoice_terms IS 'Payment terms for progress invoices (Net 10, Net 30, etc.)';
COMMENT ON COLUMN proposal_settings.balance_payment_terms IS 'When the final balance payment is due (e.g., "Upon project completion", "Net 30 from completion")';
