-- Authoritative read-only comparison of the latest committed revision and current editor source.
-- This is a gate for the future atomic relock writer, not an approval or finance mutation.
CREATE OR REPLACE FUNCTION public.inspect_change_order_revision_delta(p_change_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
 v_uid uuid := auth.uid(); v_org uuid; v_role text;
 v_co public.change_orders%ROWTYPE;
 v_revision change_order_commit.revisions%ROWTYPE;
 v_current jsonb; v_prior jsonb;
 v_changes jsonb; v_added jsonb; v_removed jsonb;
 v_financial_changed boolean;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT organization_id,role::text INTO v_org,v_role FROM public.profiles WHERE id=v_uid;
 IF v_org IS NULL OR v_role NOT IN ('admin','manager','office_manager','project_manager','sales') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
 SELECT * INTO v_co FROM public.change_orders WHERE id=p_change_order_id AND organization_id=v_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Change order not found'; END IF;
 SELECT * INTO v_revision FROM change_order_commit.revisions
  WHERE change_order_id=p_change_order_id AND organization_id=v_org
  ORDER BY revision_number DESC LIMIT 1;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('has_baseline',false,'safe_to_relock',false,'reason','missing_committed_baseline');
 END IF;
 IF v_revision.sales_order_id IS DISTINCT FROM v_co.sales_order_id THEN RAISE EXCEPTION 'Committed Sales Order mismatch'; END IF;
 IF jsonb_typeof(v_revision.committed_lines)<>'array' THEN RAISE EXCEPTION 'Invalid committed baseline'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(cli) ORDER BY cli.sort_order NULLS LAST,cli.created_at,cli.id),'[]'::jsonb)
 INTO v_current FROM public.change_order_line_items cli
 WHERE cli.change_order_id=p_change_order_id AND cli.organization_id=v_org;
 v_prior:=v_revision.committed_lines;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('line_id',nowline->>'id','before',oldline,'after',nowline)),'[]'::jsonb)
 INTO v_changes
 FROM jsonb_array_elements(v_current) nowline
 JOIN jsonb_array_elements(v_prior) oldline ON oldline->>'id'=nowline->>'id'
 WHERE nowline IS DISTINCT FROM oldline;
 SELECT COALESCE(jsonb_agg(nowline),'[]'::jsonb) INTO v_added
 FROM jsonb_array_elements(v_current) nowline
 WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_prior) oldline WHERE oldline->>'id'=nowline->>'id');
 SELECT COALESCE(jsonb_agg(oldline),'[]'::jsonb) INTO v_removed
 FROM jsonb_array_elements(v_prior) oldline
 WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_current) nowline WHERE nowline->>'id'=oldline->>'id');
 v_financial_changed := v_co.change_amount IS DISTINCT FROM (v_revision.committed_totals->>'change_amount')::numeric
  OR v_co.tax_amount IS DISTINCT FROM (v_revision.committed_totals->>'tax_amount')::numeric
  OR v_co.is_billable IS DISTINCT FROM (v_revision.committed_totals->>'is_billable')::boolean;
 RETURN jsonb_build_object('has_baseline',true,'safe_to_relock',false,
  'revision',v_revision.revision_number,'approved',v_co.status='approved','locked',v_co.is_locked,
  'changed_lines',v_changes,'added_lines',v_added,'removed_lines',v_removed,
  'financial_changed',v_financial_changed,
  'reason','requires_atomic_equipment_tax_contract_reconciliation');
END;
$function$;
REVOKE ALL ON FUNCTION public.inspect_change_order_revision_delta(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inspect_change_order_revision_delta(uuid) TO authenticated;
