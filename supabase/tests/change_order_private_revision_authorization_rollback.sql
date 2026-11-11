-- Transaction-scoped approved change-order source edit test.
-- The intentional exception rolls back BOTH the source edit and authorization.
-- Never use this test to persist modifications to customer records.
DO $test$
DECLARE v_id uuid;v_co uuid;v_before jsonb;v_after jsonb;v_changed boolean:=false;
BEGIN
 SELECT cli.id,cli.change_order_id INTO v_id,v_co FROM public.change_order_line_items cli
 JOIN public.change_orders co ON co.id=cli.change_order_id
 WHERE co.status='approved' AND co.is_locked=true LIMIT 1;
 IF v_id IS NULL THEN RAISE NOTICE 'SKIP: no approved locked source lines';RETURN;END IF;
 SELECT to_jsonb(x) INTO v_before FROM public.change_order_line_items x WHERE id=v_id;
 BEGIN
  INSERT INTO change_order_commit.material_revision_authorizations(change_order_id,transaction_id,backend_pid)
   VALUES(v_co,txid_current(),pg_backend_pid());
  UPDATE public.change_order_line_items SET new_quantity=coalesce(new_quantity,0)+1 WHERE id=v_id;
  v_changed:=true;
  RAISE EXCEPTION 'intentional_rollback';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'intentional_rollback' THEN RAISE;END IF;
 END;
 SELECT to_jsonb(x) INTO v_after FROM public.change_order_line_items x WHERE id=v_id;
 IF NOT v_changed OR v_before IS DISTINCT FROM v_after OR EXISTS(
  SELECT 1 FROM change_order_commit.material_revision_authorizations WHERE change_order_id=v_co) THEN
  RAISE EXCEPTION 'Transaction authorization or rollback failed';
 END IF;
END;
$test$;
