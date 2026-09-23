-- Drop the permissive delete policy that allows any authenticated user to delete invoices
-- This policy was overriding the draft-only delete restriction
DROP POLICY IF EXISTS "Users can delete company invoices" ON invoices;

-- Recreate as draft-only
CREATE POLICY "Users can delete company invoices" ON invoices FOR DELETE TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND status = 'draft'
  );
