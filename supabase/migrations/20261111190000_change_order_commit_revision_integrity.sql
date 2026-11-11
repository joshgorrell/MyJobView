-- Integrity guard for future committed change-order revision writers.
-- Does not activate approval, lock, unlock, or proposal-line reconciliation.
CREATE OR REPLACE FUNCTION change_order_commit.validate_revision_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_order_org uuid;
  v_co_org uuid;
  v_co_order uuid;
  v_co_status text;
  v_co_locked boolean;
  v_previous bigint;
BEGIN
  -- Serialize commits to this change order, even if two writers race on an empty ledger.
  SELECT organization_id, sales_order_id, status, is_locked
    INTO v_co_org, v_co_order, v_co_status, v_co_locked
    FROM public.change_orders WHERE id = NEW.change_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Change order not found';
  END IF;
  SELECT organization_id INTO v_order_org
    FROM public.sales_orders WHERE id = NEW.sales_order_id;
  IF v_co_org IS DISTINCT FROM NEW.organization_id
     OR v_order_org IS DISTINCT FROM NEW.organization_id
     OR v_co_order IS DISTINCT FROM NEW.sales_order_id THEN
    RAISE EXCEPTION 'Committed revision organization or order mismatch';
  END IF;
  IF v_co_status IS DISTINCT FROM 'approved' OR v_co_locked IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Only customer-approved and locked change orders may be committed';
  END IF;
  SELECT COALESCE(MAX(revision_number), 0) INTO v_previous
    FROM change_order_commit.revisions WHERE change_order_id = NEW.change_order_id;
  IF NEW.revision_number <> v_previous + 1 THEN
    RAISE EXCEPTION 'Committed revision out of sequence: expected %', v_previous + 1;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION change_order_commit.validate_revision_insert() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS validate_committed_revision_insert ON change_order_commit.revisions;
CREATE TRIGGER validate_committed_revision_insert
  BEFORE INSERT ON change_order_commit.revisions
  FOR EACH ROW EXECUTE FUNCTION change_order_commit.validate_revision_insert();
COMMENT ON FUNCTION change_order_commit.validate_revision_insert() IS
 'Tenant/order/approved+locked/monotonic revision guard. A separate transaction-safe writer must reconcile Sales Order lines and financial totals before inserting. Not a commit RPC.';
