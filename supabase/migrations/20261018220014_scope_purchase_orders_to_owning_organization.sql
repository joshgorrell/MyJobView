/*
# Scope purchase_orders access to the owning organization

1. Problem
   - Policies `po_select_authenticated`, `po_insert_authenticated`,
     `po_update_authenticated` and `po_delete_authenticated` were defined with the
     predicate `true` for every authenticated user. Permissive policies are combined
     with OR, so these nullified the correctly scoped
     `purchase_orders_*_same_org` and `purchasing_po_boundary` policies and let any
     signed-in user read, change or delete another company's purchase orders.
   - `purchasing_po_draft_delete` allowed deleting ANY draft purchase order in ANY
     organization because it tested only `status = 'draft'`.

2. Changes
   - Drops the four unrestricted policies.
   - Recreates the draft delete policy with an organization check.

3. Notes
   1. The remaining organization scoped policies already cover all legitimate use.
   2. No data is modified or removed.
*/

DROP POLICY IF EXISTS "po_select_authenticated" ON public.purchase_orders;
DROP POLICY IF EXISTS "po_insert_authenticated" ON public.purchase_orders;
DROP POLICY IF EXISTS "po_update_authenticated" ON public.purchase_orders;
DROP POLICY IF EXISTS "po_delete_authenticated" ON public.purchase_orders;

DROP POLICY IF EXISTS "purchasing_po_draft_delete" ON public.purchase_orders;
CREATE POLICY "purchasing_po_draft_delete"
  ON public.purchase_orders FOR DELETE
  TO authenticated
  USING (status = 'draft' AND organization_id = get_user_org_id());