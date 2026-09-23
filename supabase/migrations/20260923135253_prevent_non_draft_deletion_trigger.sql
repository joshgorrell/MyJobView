-- Add a BEFORE DELETE trigger to prevent deletion of non-draft invoices
-- This is needed because a platform-managed permissive DELETE policy keeps being recreated
-- The trigger provides a hard database-level guard that works regardless of RLS policy evaluation

CREATE OR REPLACE FUNCTION prevent_non_draft_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'Cannot delete a submitted invoice. Only draft invoices can be deleted. Void the invoice instead.'
    USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_non_draft_deletion ON invoices;
CREATE TRIGGER trg_prevent_non_draft_deletion
  BEFORE DELETE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION prevent_non_draft_deletion();
