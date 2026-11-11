-- Read-only verification of the live change-order revision protections.
-- Run as a privileged database operator; no application data is modified.
DO $test$
DECLARE
 v_guard_exists boolean;
 v_ledger_count bigint;
 v_uncommitted_approved bigint;
 v_invalid_revisions bigint;
 v_rpc_exists boolean;
BEGIN
 SELECT EXISTS (
   SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='change_order_line_items'
     AND t.tgname='trg_guard_locked_change_order_line_mutation' AND t.tgenabled='O'
 ) INTO v_guard_exists;
 IF NOT v_guard_exists THEN RAISE EXCEPTION 'Locked change-order line guard missing or disabled'; END IF;
 SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='approve_and_apply_change_order') INTO v_rpc_exists;
 IF NOT v_rpc_exists THEN RAISE EXCEPTION 'Atomic approval RPC missing'; END IF;
 SELECT count(*) INTO v_ledger_count FROM change_order_commit.revisions;
 SELECT count(*) INTO v_invalid_revisions FROM change_order_commit.revisions r
 LEFT JOIN public.change_orders co ON co.id=r.change_order_id
 LEFT JOIN public.sales_orders so ON so.id=r.sales_order_id
 WHERE co.id IS NULL OR so.id IS NULL OR co.organization_id IS DISTINCT FROM r.organization_id
 OR so.organization_id IS DISTINCT FROM r.organization_id OR co.sales_order_id IS DISTINCT FROM r.sales_order_id
 OR jsonb_typeof(r.committed_lines)<>'array';
 IF v_invalid_revisions>0 THEN RAISE EXCEPTION '% invalid committed revisions',v_invalid_revisions; END IF;
 -- Existing approved COs can predate the ledger. Report, do not infer or backfill.
 SELECT count(*) INTO v_uncommitted_approved FROM public.change_orders co
 WHERE co.status='approved' AND NOT EXISTS
 (SELECT 1 FROM change_order_commit.revisions r WHERE r.change_order_id=co.id);
 RAISE NOTICE 'Change-order safeguards verified. Committed revisions: %, legacy approved without baseline: %',
 v_ledger_count,v_uncommitted_approved;
END $test$;
