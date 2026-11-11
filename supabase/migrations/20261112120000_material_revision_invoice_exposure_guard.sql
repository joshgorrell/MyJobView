-- Resolve invoice exposure using actual MJV billing tables rather than
-- removed change_orders.amount_billed. Keep the untested writer inaccessible.
CREATE OR REPLACE FUNCTION public.commit_staged_change_order_material_revision(p_change_order_id uuid,p_expected_edit_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
 v_uid uuid:=auth.uid();v_org uuid;v_role text;v_co public.change_orders%ROWTYPE;
 v_so public.sales_orders%ROWTYPE;v_d change_order_commit.revision_drafts%ROWTYPE;
 v_base change_order_commit.revisions%ROWTYPE;v_old jsonb;v_new jsonb;
 v_line public.change_order_line_items%ROWTYPE;v_target public.proposal_line_items%ROWTYPE;
 v_oldqty numeric;v_oldprice numeric;v_newqty numeric;v_newprice numeric;
 v_delta numeric:=0;v_newamount numeric;v_lines jsonb;v_totals jsonb;v_fingerprint text;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT organization_id,role::text INTO v_org,v_role FROM public.profiles WHERE id=v_uid;
 IF v_org IS NULL OR v_role NOT IN ('admin','manager') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
 SELECT * INTO v_co FROM public.change_orders WHERE id=p_change_order_id AND organization_id=v_org FOR UPDATE;
 IF NOT FOUND OR v_co.status<>'approved' OR v_co.is_locked IS DISTINCT FROM true THEN RAISE EXCEPTION 'Approved locked change order required'; END IF;
 SELECT * INTO v_so FROM public.sales_orders WHERE id=v_co.sales_order_id AND organization_id=v_org FOR UPDATE;
 IF NOT FOUND OR v_so.proposal_id IS NULL THEN RAISE EXCEPTION 'Sales Order proposal missing'; END IF;
 SELECT * INTO v_base FROM change_order_commit.revisions WHERE change_order_id=v_co.id AND organization_id=v_org ORDER BY revision_number DESC LIMIT 1;
 IF NOT FOUND OR v_base.sales_order_id<>v_so.id THEN RAISE EXCEPTION 'Trusted committed baseline missing'; END IF;
 SELECT * INTO v_d FROM change_order_commit.revision_drafts WHERE change_order_id=v_co.id AND organization_id=v_org FOR UPDATE;
 IF NOT FOUND OR v_d.base_revision_number<>v_base.revision_number OR v_d.edit_version IS DISTINCT FROM p_expected_edit_version THEN RAISE EXCEPTION 'Staged revision stale; reload before committing'; END IF;
 PERFORM public.validate_change_order_revision_draft_lines(v_d.draft_lines);
 -- If the schema has no billing exposure column, do not assume zero exposure.
 -- Existing MJV invoice records, not removed legacy CO fields, are the billing source.
 -- Block if ANY invoice references the Sales Order, including drafts, voided,
 -- or imported invoices: a false positive is safer than changing billed equipment.
 IF EXISTS (SELECT 1 FROM public.invoices i
            WHERE i.sales_order_id=v_so.id OR i.proposal_id=v_so.proposal_id)
    OR EXISTS (SELECT 1 FROM public.invoice_change_order_links l
               WHERE l.change_order_id=v_co.id)
    OR EXISTS (SELECT 1 FROM public.invoice_line_item_sources src
               JOIN public.change_order_line_items li ON li.id=src.source_id
               WHERE li.change_order_id=v_co.id)
 THEN RAISE EXCEPTION 'Sales Order or change order has invoice exposure; revision commit requires billing reconciliation';
 END IF;
 -- An invoice may be linked only to a project; without a verified link
 -- the writer must refuse rather than infer the invoice is unrelated.
 IF v_co.project_id IS NOT NULL AND EXISTS(
   SELECT 1 FROM public.invoices i WHERE i.project_id=v_co.project_id)
 THEN RAISE EXCEPTION 'Project invoice exposure requires billing reconciliation'; END IF;
 IF v_co.is_billable IS DISTINCT FROM true OR coalesce(v_co.tax_amount,0)<>0 OR coalesce((to_jsonb(v_co)->>'amount_billed')::numeric,0)<>0 OR
    coalesce(v_co.labor_subtotal,0)<>0 OR coalesce((to_jsonb(v_co)->>'labor_hours_added')::numeric,0)<>0 OR
    coalesce((to_jsonb(v_co)->>'discount_amount')::numeric,0)<>0 OR coalesce((to_jsonb(v_co)->>'project_management_amount')::numeric,0)<>0 OR
    coalesce((to_jsonb(v_co)->>'project_design_amount')::numeric,0)<>0 OR coalesce((to_jsonb(v_co)->>'system_design_amount')::numeric,0)<>0 OR
    coalesce((to_jsonb(v_co)->>'misc_parts_amount')::numeric,0)<>0 OR coalesce((to_jsonb(v_co)->>'custom_modifier_1_amount')::numeric,0)<>0 OR
    coalesce((to_jsonb(v_co)->>'custom_modifier_2_amount')::numeric,0)<>0 OR coalesce((to_jsonb(v_co)->>'credit_card_fee_amount')::numeric,0)<>0 THEN
  RAISE EXCEPTION 'Tax, labor, modifiers or billing require full financial reconciliation';
 END IF;
 IF (v_base.committed_totals->>'change_amount')::numeric IS DISTINCT FROM v_co.change_amount OR
    coalesce((v_base.committed_totals->>'tax_amount')::numeric,0)<>0 OR
    (v_base.committed_totals->>'is_billable')::boolean IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Committed financial baseline drift';
 END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(v_base.committed_lines))<>(SELECT count(*) FROM jsonb_array_elements(v_d.draft_lines)) OR
    (SELECT count(*) FROM public.change_order_line_items WHERE change_order_id=v_co.id AND organization_id=v_org)<>(SELECT count(*) FROM jsonb_array_elements(v_base.committed_lines)) THEN
  RAISE EXCEPTION 'Source line set changed';
 END IF;
 -- Private transaction authorization, visible only to the finalized-line guard.
 INSERT INTO change_order_commit.material_revision_authorizations(change_order_id,transaction_id,backend_pid)
 VALUES(v_co.id,txid_current(),pg_backend_pid());
 FOR v_new IN SELECT value FROM jsonb_array_elements(v_d.draft_lines) LOOP
  SELECT value INTO v_old FROM jsonb_array_elements(v_base.committed_lines) WHERE value->>'id'=v_new->>'id';
  IF v_old IS NULL OR v_old->>'action_type'<>'add' OR v_new->>'action_type'<>'add' OR
     (v_new-ARRAY['new_quantity','new_unit_price','new_total','change_amount']) IS DISTINCT FROM
     (v_old-ARRAY['new_quantity','new_unit_price','new_total','change_amount']) THEN
   RAISE EXCEPTION 'Unsupported revision action or source metadata change';
  END IF;
  SELECT * INTO v_line FROM public.change_order_line_items WHERE id=(v_new->>'id')::uuid AND change_order_id=v_co.id AND organization_id=v_org FOR UPDATE;
  IF NOT FOUND OR to_jsonb(v_line) IS DISTINCT FROM v_old THEN RAISE EXCEPTION 'Committed source changed outside revision process'; END IF;
  SELECT * INTO v_target FROM public.proposal_line_items WHERE committed_change_order_line_id=v_line.id AND proposal_id=v_so.proposal_id AND organization_id=v_org FOR UPDATE;
  IF NOT FOUND OR v_target.is_hidden IS TRUE THEN RAISE EXCEPTION 'Committed equipment target missing or hidden'; END IF;
  v_oldqty:=(v_old->>'new_quantity')::numeric;v_oldprice:=(v_old->>'new_unit_price')::numeric;
  v_newqty:=(v_new->>'new_quantity')::numeric;v_newprice:=(v_new->>'new_unit_price')::numeric;
  IF v_target.quantity IS DISTINCT FROM v_oldqty OR v_target.unit_price IS DISTINCT FROM v_oldprice OR
     v_target.line_total IS DISTINCT FROM round(v_oldqty*v_oldprice,2) OR
     coalesce(v_target.labor_total,0)<>0 OR coalesce((v_old->>'new_labor_total')::numeric,0)<>0 OR
     coalesce((v_old->>'labor_total')::numeric,0)<>0 OR
     (v_old->>'new_total')::numeric IS DISTINCT FROM round(v_oldqty*v_oldprice,2) OR
     (v_new->>'new_total')::numeric IS DISTINCT FROM round(v_newqty*v_newprice,2) THEN
   RAISE EXCEPTION 'Line includes labor/other charges or target drift; full reconciliation required';
  END IF;
  v_delta:=v_delta+round(v_newqty*v_newprice,2)-round(v_oldqty*v_oldprice,2);
  UPDATE public.proposal_line_items SET quantity=v_newqty,unit_price=v_newprice,line_total=round(v_newqty*v_newprice,2),updated_at=now() WHERE id=v_target.id;
  UPDATE public.change_order_line_items SET new_quantity=v_newqty,new_unit_price=v_newprice,new_total=round(v_newqty*v_newprice,2),
    change_amount=coalesce((v_old->>'change_amount')::numeric,0)+round(v_newqty*v_newprice,2)-round(v_oldqty*v_oldprice,2)
   WHERE id=v_line.id;
 END LOOP;
 v_delta:=round(v_delta,2);
 IF v_delta=0 THEN RAISE EXCEPTION 'No material financial difference to commit'; END IF;
 v_newamount:=round(v_co.change_amount+v_delta,2);
 UPDATE public.change_orders SET change_amount=v_newamount,parts_subtotal=coalesce(parts_subtotal,0)+v_delta,updated_at=now()
  WHERE id=v_co.id AND organization_id=v_org;
 -- The existing approved CO contract-total trigger recalculates from original + approved COs.
 -- Do not call calculate_proposal_totals here: it includes hidden historic equipment.
 SELECT COALESCE(jsonb_agg(to_jsonb(cli) ORDER BY cli.sort_order NULLS LAST,cli.created_at,cli.id),'[]'::jsonb)
 INTO v_lines FROM public.change_order_line_items cli WHERE cli.change_order_id=v_co.id AND cli.organization_id=v_org;
 SELECT jsonb_build_object('change_amount',co.change_amount,'tax_amount',co.tax_amount,'is_billable',co.is_billable,'new_contract_total',co.new_contract_total)
 INTO v_totals FROM public.change_orders co WHERE co.id=v_co.id;
 v_fingerprint:=md5(v_lines::text||':'||v_totals::text);
 INSERT INTO change_order_commit.revisions(organization_id,change_order_id,sales_order_id,revision_number,committed_lines,committed_totals,source_fingerprint,committed_by)
 VALUES(v_org,v_co.id,v_so.id,v_base.revision_number+1,v_lines,v_totals,v_fingerprint,v_uid);
 DELETE FROM change_order_commit.material_revision_authorizations WHERE change_order_id=v_co.id AND transaction_id=txid_current() AND backend_pid=pg_backend_pid();
 DELETE FROM change_order_commit.revision_drafts WHERE change_order_id=v_co.id AND organization_id=v_org;
 RETURN jsonb_build_object('success',true,'revision',v_base.revision_number+1,'material_delta',v_delta,'new_change_amount',v_newamount);
END;
$function$;



REVOKE ALL ON FUNCTION public.commit_staged_change_order_material_revision(uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
