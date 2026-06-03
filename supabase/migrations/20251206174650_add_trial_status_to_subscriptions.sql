/*
  # Add Trial Status to Recurring Subscriptions

  ## Summary
  Adds trial status support for 90-day test and tune trials. Customers can be put on trial
  to access punchlist features, then must subscribe to a VIP plan after trial expires.

  ## Changes
  1. Add 'trial' to status constraint
  2. Add trial_end_date column to track when trial expires
  3. Add trial_started_date to track trial start

  ## Security
  - No RLS changes needed, inherits existing policies
*/

-- Add trial to the status check constraint
ALTER TABLE recurring_subscriptions
DROP CONSTRAINT IF EXISTS recurring_subscriptions_status_check;

ALTER TABLE recurring_subscriptions
ADD CONSTRAINT recurring_subscriptions_status_check 
CHECK (status IN ('trial', 'active', 'paused', 'cancelled', 'expired'));

-- Add trial tracking columns
ALTER TABLE recurring_subscriptions
ADD COLUMN IF NOT EXISTS trial_end_date date,
ADD COLUMN IF NOT EXISTS trial_started_date date;

-- Create index for finding expiring trials
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_end 
ON recurring_subscriptions(trial_end_date) 
WHERE status = 'trial';
