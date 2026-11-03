/*
# Scope po_items access to the owning organization

1. Problem
   - Policies `po_items_select_authenticated`, `po_items_insert_authenticated`,
     `po_items_update_authenticated` and `po_items_delete_authenticated` used the
     predicate `true`, so any signed-in user could read and change the part numbers,
     quantities and unit costs on another company's purchase orders.

2. Changes
   - Drops the four unrestricted policies. The existing `select_po_items`,
     `insert_po_items`, `update_po_items`, `delete_po_items` and
     `purchasing_line_boundary` policies already scope access by
     `organization_id = get_user_org_id()`.

3. Notes
   1. No data is modified or removed.
*/

DROP POLICY IF EXISTS "po_items_select_authenticated" ON public.po_items;
DROP POLICY IF EXISTS "po_items_insert_authenticated" ON public.po_items;
DROP POLICY IF EXISTS "po_items_update_authenticated" ON public.po_items;
DROP POLICY IF EXISTS "po_items_delete_authenticated" ON public.po_items;