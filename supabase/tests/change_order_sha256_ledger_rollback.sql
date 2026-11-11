-- Non-persistent verification of the SHA-256 committed revision ledger.
-- Runs an INSERT into the actual ledger in a nested PL/pgSQL exception block,
-- deliberately raises, and verifies the INSERT was rolled back.
DO $test$
DECLARE v_co public.change_orders%ROWTYPE;v_lines jsonb;v_totals jsonb;
 v_fp text;v_ok boolean:=false;v_before integer;
BEGIN
 SELECT * INTO v_co FROM public.change_orders
 WHERE status='approved' AND is_locked=true
 AND NOT EXISTS(SELECT 1 FROM change_order_commit.revisions r WHERE r.change_order_id=change_orders.id)
 ORDER BY id LIMIT 1;
 IF NOT FOUND THEN RAISE NOTICE 'SKIP: no uncommitted approved CO fixture';RETURN;END IF;
 SELECT count(*) INTO v_before FROM change_order_commit.revisions WHERE change_order_id=v_co.id;
 SELECT coalesce(jsonb_agg(to_jsonb(li) ORDER BY li.sort_order NULLS LAST,li.created_at,li.id),'[]'::jsonb)
 INTO v_lines FROM public.change_order_line_items li WHERE li.change_order_id=v_co.id;
 SELECT jsonb_build_object('change_amount',v_co.change_amount,'tax_amount',v_co.tax_amount,
  'is_billable',v_co.is_billable,'new_contract_total',v_co.new_contract_total) INTO v_totals;
 v_fp:=encode(sha256(convert_to(v_lines::text||':'||v_totals::text,'UTF8')),'hex');
 IF length(v_fp)<>64 THEN RAISE EXCEPTION 'Invalid SHA-256 length';END IF;
 BEGIN
  INSERT INTO change_order_commit.revisions(organization_id,change_order_id,sales_order_id,
   revision_number,committed_lines,committed_totals,source_fingerprint)
  VALUES(v_co.organization_id,v_co.id,v_co.sales_order_id,1,v_lines,v_totals,v_fp);
  v_ok:=true;
  RAISE EXCEPTION 'intentional_rollback';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'intentional_rollback' THEN RAISE;END IF;
 END;
 IF NOT v_ok OR (SELECT count(*) FROM change_order_commit.revisions WHERE change_order_id=v_co.id)<>v_before
 THEN RAISE EXCEPTION 'Ledger insert rollback failed';END IF;
END $test$;
