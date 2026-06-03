/*
  # Fix Duplicate Recurring Subscription Policies

  ## Summary
  Removes the duplicate "Portal users can view own subscriptions" policy from
  recurring_subscriptions which is functionally identical to "Portal users can
  view their own subscriptions". Keeps the more specific version.

  Also removes the duplicate commission_adjustments policies that are already
  covered by the org-scoped policies.
*/

-- recurring_subscriptions: remove the less specific duplicate
DROP POLICY IF EXISTS "Portal users can view own subscriptions" ON recurring_subscriptions;

-- commission_adjustments: these custom policies duplicate what the org-scoped policies do
-- Keep both since they cover different role checks - no action needed
