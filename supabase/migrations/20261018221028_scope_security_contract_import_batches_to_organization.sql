/*
# Scope security contract import batches to the owning organization

1. Problem
   - All four CRUD policies on security_contract_import_batches used true, so any
     signed-in user of any company could read, create, update, or delete every
     company's contract import batches.

2. Changes
   - Replaces all four policies with organization_id = get_user_org_id() checks.

3. Notes
   1. Users keep full CRUD on their own company's batches.
   2. No data is modified or removed.
*/

DROP POLICY IF EXISTS "select_contract_import_batches" ON public.security_contract_import_batches;
DROP POLICY IF EXISTS "insert_contract_import_batches" ON public.security_contract_import_batches;
DROP POLICY IF EXISTS "update_contract_import_batches" ON public.security_contract_import_batches;
DROP POLICY IF EXISTS "delete_contract_import_batches" ON public.security_contract_import_batches;

CREATE POLICY "select_contract_import_batches"
  ON public.security_contract_import_batches FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "insert_contract_import_batches"
  ON public.security_contract_import_batches FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "update_contract_import_batches"
  ON public.security_contract_import_batches FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "delete_contract_import_batches"
  ON public.security_contract_import_batches FOR DELETE
  TO authenticated
  USING (organization_id = get_user_org_id());