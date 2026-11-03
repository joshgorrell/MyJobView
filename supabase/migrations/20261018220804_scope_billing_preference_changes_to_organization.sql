/*
# Scope billing preference history to the owning organization

1. Problem
   - "select_billing_preference_changes" used USING (true), so any signed-in user of
     any company could read the billing preference change history of every company.

2. Changes
   - Replaces the policy with one restricted to the caller's own organization.

3. Notes
   1. Users keep full access to their own company's history.
   2. No data is modified or removed.
*/

DROP POLICY IF EXISTS "select_billing_preference_changes" ON public.billing_preference_changes;

CREATE POLICY "select_billing_preference_changes"
  ON public.billing_preference_changes FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());