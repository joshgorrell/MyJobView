-- A transactional revision writer for previously committed ADD lines only.
-- Fail closed on removals/modifiers until their separate delta reconciliation is implemented.
CREATE OR REPLACE FUNCTION public.relock_change_order_additions(p_change_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
 v_uid uuid := auth.uid(); v_org uuid; v_role text;
 v_co public.change_orders%ROWTYPE; v_so public.sales_orders%ROWTYPE;
 v_previous change_order_commit.revisions%ROWTYPE;
 v_old jsonb; v_new jsonb; v_old_line jsonb; v_line public.change_order_line_items%ROWTYPE;
 v_target public.proposal_line_items%ROWTYPE;
 v_lines jsonb; v_totals jsonb; v_fingerprint text;
 v_old_amount numeric; v_old_tax numeric;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT organization_id,role::text INTO v_org,v_role FROM public.profiles WHERE id=v_uid;
 IF v_org IS NULL OR v_role NOT IN ('admin','manager') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
 SELECT * INTO v_co FROM public.change_orders WHERE id=p_change_order_id AND organization_id=v_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Change order not found'; END IF;
 IF v_co.status<>'approved' OR v_co.is_locked IS DISTINCT FROM false THEN RAISE EXCEPTION 'Only approved, unlocked change orders can be relocked'; END IF;
 SELECT * INTO v_so FROM public.sales_orders WHERE id=v_co.sales_order_id AND organization_id=v_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sales Order not found'; END IF;
 SELECT * INTO v_previous FROM change_order_commit.revisions WHERE change_order_id=v_co.id AND organization_id=v_org ORDER BY revision_number DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Committed baseline missing; legacy change order requires manual reconciliation'; END IF;
 IF v_previous.sales_order_id<>v_so.id THEN RAISE EXCEPTION 'Committed Sales Order mismatch'; END IF;
 v_old := v_previous.committed_lines;
 IF jsonb_typeof(v_old)<>'array' THEN RAISE EXCEPTION 'Invalid committed source snapshot'; END IF;
 -- Existing removed/modified lines must never be silently reinterpreted by the additions-only writer.
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_old) e WHERE e->>'action_type'<>'add') OR
    EXISTS (SELECT 1 FROM public.change_order_line_items WHERE change_order_id=v_co.id AND action_type<>'add') THEN
   RAISE EXCEPTION 'Revision includes removals/modifications; full reconciliation required';
 END IF;
 -- Freeze all original line identities: this writer supports price and quantity corrections only.
 IF (SELECT count(*) FROM jsonb_array_elements(v_old)) <> (SELECT count(*) FROM public.change_order_line_items WHERE change_order_id=v_co.id AND organization_id=v_org) THEN
   RAISE EXCEPTION 'Added/removed change-order lines require full reconciliation';
 END IF;
 FOR v_line IN SELECT * FROM public.change_order_line_items WHERE change_order_id=v_co.id AND organization_id=v_org ORDER BY id FOR UPDATE LOOP
   SELECT e INTO v_old_line FROM jsonb_array_elements(v_old) e WHERE e->>'id'=v_line.id::text;
   IF v_old_line IS NULL THEN RAISE EXCEPTION 'Unrecognized source line %',v_line.id; END IF;
   -- All attributes except quantity, price and derived totals must match the committed baseline.
   IF (to_jsonb(v_line) - ARRAY['new_quantity','new_unit_price','new_total','change_amount','updated_at'])
      IS DISTINCT FROM (v_old_line - ARRAY['new_quantity','new_unit_price','new_total','change_amount','updated_at']) THEN
      RAISE EXCEPTION 'Unsupported source line edit %',v_line.id;
   END IF;
   SELECT * INTO v_target FROM public.proposal_line_items WHERE committed_change_order_line_id=v_line.id AND proposal_id=v_so.proposal_id AND organization_id=v_org FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Committed addition target missing %',v_line.id; END IF;
   IF v_target.quantity IS DISTINCT FROM (v_old_line->>'new_quantity')::numeric OR v_target.unit_price IS DISTINCT FROM (v_old_line->>'new_unit_price')::numeric THEN
     RAISE EXCEPTION 'Committed target changed outside reconciliation %',v_line.id;
   END IF;
   IF v_line.new_quantity IS NULL OR v_line.new_quantity<=0 OR v_line.new_unit_price IS NULL OR v_line.new_unit_price<0 THEN
     RAISE EXCEPTION 'Invalid revised quantity or price %',v_line.id;
   END IF;
   UPDATE public.proposal_line_items SET quantity=v_line.new_quantity,unit_price=v_line.new_unit_price,
     line_total=round(v_line.new_quantity*v_line.new_unit_price,2),updated_at=now() WHERE id=v_target.id;
 END LOOP;
 -- Never recompute the contract from equipment line totals: labor, modifiers and tax are separate.
 -- Caller must have updated the CO's authoritative financial totals before relocking.
 SELECT co.change_amount,co.tax_amount INTO v_old_amount,v_old_tax FROM public.change_orders co WHERE co.id=v_co.id;
 IF v_old_amount IS NULL THEN RAISE EXCEPTION 'Change order financial total missing'; END IF;
 UPDATE public.change_orders SET is_locked=true,is_active=false,updated_at=now() WHERE id=v_co.id AND organization_id=v_org;
 PERFORM public.calculate_proposal_totals(v_so.proposal_id);
 SELECT COALESCE(jsonb_agg(to_jsonb(cli) ORDER BY cli.sort_order NULLS LAST,cli.created_at,cli.id),'[]'::jsonb)
 INTO v_lines FROM public.change_order_line_items cli WHERE cli.change_order_id=v_co.id AND cli.organization_id=v_org;
 SELECT jsonb_build_object('change_amount',co.change_amount,'tax_amount',co.tax_amount,'is_billable',co.is_billable,'new_contract_total',co.new_contract_total)
 INTO v_totals FROM public.change_orders co WHERE co.id=v_co.id;
 v_fingerprint := md5(v_lines::text||':'||v_totals::text);
 INSERT INTO change_order_commit.revisions(organization_id,change_order_id,sales_order_id,revision_number,committed_lines,committed_totals,source_fingerprint,committed_by)
 VALUES(v_org,v_co.id,v_so.id,v_previous.revision_number+1,v_lines,v_totals,v_fingerprint,v_uid);
 RETURN jsonb_build_object('success',true,'revision',v_previous.revision_number+1);
END;
$function$;
REVOKE ALL ON FUNCTION public.relock_change_order_additions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.relock_change_order_additions(uuid) TO authenticated;
