/*
  # Add Pending Payment Status to Subscriptions

  ## Summary
  Adds 'pending_payment' status to recurring subscriptions to support self-service VIP signups
  that require payment before activation. This ensures only admin-initiated trials get free access,
  while self-service signups must pay first.

  ## Changes
  1. Update Status Constraint
    - Add 'pending_payment' to the allowed status values
    - Status flow: pending_payment -> active (after payment)
    - Trial flow (admin only): trial -> active (after payment)

  ## Notes
  - Self-service portal signups create 'pending_payment' subscriptions
  - Admin-initiated punchlist invites create 'trial' subscriptions (90 days free)
  - Only 'active' and 'trial' statuses grant portal access
  - 'pending_payment' subscriptions do not grant portal access until payment is confirmed
*/

-- Update status constraint to include pending_payment
ALTER TABLE recurring_subscriptions
DROP CONSTRAINT IF EXISTS recurring_subscriptions_status_check;

ALTER TABLE recurring_subscriptions
ADD CONSTRAINT recurring_subscriptions_status_check 
CHECK (status IN ('pending_payment', 'trial', 'active', 'paused', 'cancelled', 'expired'));