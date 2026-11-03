/*\n  # Fix Payments Table RLS for Multi-Tenancy\n\n  1. Changes\n    - Drop old company_id-based policies on payments table\n    - Add org-scoped policies\n\n  2. Security\n    - All access scoped by organization_id = get_user_org_id()\n*/\n\nDROP POLICY IF EXISTS "Staff can view payments in their company" ON payments

\nDROP POLICY IF EXISTS "Staff can update payments in their company" ON payments

\nDROP POLICY IF EXISTS "Staff can delete payments in their company" ON payments

\n\nCREATE POLICY "payments_select_same_org" ON payments FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "payments_insert_same_org" ON payments FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "payments_update_same_org" ON payments FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "payments_delete_same_org" ON payments FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n
