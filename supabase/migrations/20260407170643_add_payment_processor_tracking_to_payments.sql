/*
  # Add Payment Processor Tracking to Payments Table

  ## Summary
  Adds columns to the payments table to track which payment processor was used
  for each payment, enabling audit trails and reconciliation with external systems.

  ## New Columns on payments
  - `payment_processor` - Which processor handled this payment (quickbooks, stripe, bill_com, or null for manual)
  - `processor_transaction_id` - External transaction ID from the processor
    (generalizes the existing stripe_payment_intent_id field)

  ## Notes
  - Both columns are nullable — null means the payment was recorded manually
  - Existing qbo_payment_id and stripe_payment_intent_id columns are preserved for backwards compatibility
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'payment_processor'
  ) THEN
    ALTER TABLE payments ADD COLUMN payment_processor text
      CHECK (payment_processor IN ('quickbooks', 'stripe', 'bill_com'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'processor_transaction_id'
  ) THEN
    ALTER TABLE payments ADD COLUMN processor_transaction_id text;
  END IF;
END $$;
