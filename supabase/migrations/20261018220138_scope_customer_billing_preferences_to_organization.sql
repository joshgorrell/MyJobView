/*
# Scope customer_billing_preferences access to the owning organization

1. Problem
   - The `select_`, `insert_`, `update_` and `delete_customer_billing_preferences`
     policies used the predicate `true`, so any signed-in user could read or change
     the billing preferences of customers belonging to any other organization.

2. Changes
   - Replaces the four policies with equivalents scoped by
     `organization_id = get_user_org_id()`.

3. Notes
   1. Staff keep full access within their own organization.
   2. No data is modified or removed.
*/

DROP POLICY IF EXISTS "select_customer_billing_preferences" ON public.customer_billing_preferences;
DROP POLICY IF EXISTS "insert_customer_billing_preferences" ON public.customer_billing_preferences;
DROP POLICY IF EXISTS "update_customer_billing_preferences" ON public.customer_billing_preferences;
DROP POLICY IF EXISTS "delete_customer_billing_preferences" ON public.customer_billing_preferences;

CREATE POLICY "select_customer_billing_preferences"
  ON public.customer_billing_preferences FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "insert_customer_billing_preferences"
  ON public.customer_billing_preferences FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "update_customer_billing_preferences"
  ON public.customer_billing_preferences FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "delete_customer_billing_preferences"
  ON public.customer_billing_preferences FOR DELETE
  TO authenticated
  USING (organization_id = get_user_org_id());