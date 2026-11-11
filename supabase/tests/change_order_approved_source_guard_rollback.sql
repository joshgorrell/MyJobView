-- Non-destructive production-safe guard test. Runs an attempted edit in a
-- PL/pgSQL exception subtransaction, then proves the original row is unchanged.
DO $test$
DECLARE v_id uuid;v_before jsonb;v_after jsonb;v_denied boolean:=false;
BEGIN
 SELECT cli.id INTO v_id FROM public.change_order_line_items cli
 JOIN public.change_orders co ON co.id=cli.change_order_id
 WHERE co.status='approved' AND co.is_locked=true LIMIT 1;
 IF v_id IS NULL THEN RAISE NOTICE 'SKIP: no locked approved source line exists';RETURN;END IF;
 SELECT to_jsonb(cli) INTO v_before FROM public.change_order_line_items cli WHERE id=v_id;
 BEGIN
  UPDATE public.change_order_line_items SET new_quantity=coalesce(new_quantity,0)+1 WHERE id=v_id;
 EXCEPTION WHEN OTHERS THEN v_denied:=true;
 END;
 SELECT to_jsonb(cli) INTO v_after FROM public.change_order_line_items cli WHERE id=v_id;
 IF NOT v_denied OR v_before IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'Approved source line guard failed';END IF;
 IF has_function_privilege('authenticated','public.commit_staged_change_order_material_revision(uuid,bigint)','EXECUTE') OR
    has_table_privilege('authenticated','change_order_commit.material_revision_authorizations','INSERT') THEN
  RAISE EXCEPTION 'Unverified financial writer or authorization accessible to users';
 END IF;
END;
$test$;
