/*
  # Add QuickBooks Payment ID to Subscription Payments

  1. Changes
    - Add qbo_payment_id column to subscription_payments table
    - This allows tracking payments processed through QuickBooks

  2. Notes
    - Nullable since not all payments go through QuickBooks
    - Indexed for faster lookups
*/

-- Add qbo_payment_id column
ALTER TABLE subscription_payments
ADD COLUMN IF NOT EXISTS qbo_payment_id text;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_subscription_payments_qbo_payment_id
ON subscription_payments(qbo_payment_id);
