-- A trusted, read-only staging preview for the atomic revision writer.
-- No contract/tax mutation; financial impact is explicit and cannot be inferred from price alone.
CREATE OR REPLACE FUNCTION public.inspect_staged_change_order_revision(p_change_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
 v_uid uuid:=auth.uid();v_org uuid;v_role text;v_co public.change_orders%ROWTYPE;
 v_draft change_order_commit.revision_drafts%ROWTYPE;v_baseline change_order_commit.revisions%ROWTYPE;
 v_diff jsonb;v_delta numeric:=0;v_count integer:=0;v_unresolved integer:=0;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT organization_id,role::text INTO v_org,v_role FROM public.profiles WHERE id=v_uid;
 IF v_org IS NULL OR v_role NOT IN ('admin','manager','office_manager','project_manager','sales') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
 SELECT * INTO v_co FROM public.change_orders WHERE id=p_change_order_id AND organization_id=v_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Change order not found'; END IF;
 SELECT * INTO v_draft FROM change_order_commit.revision_drafts WHERE change_order_id=v_co.id AND organization_id=v_org;
 IF NOT FOUND THEN RETURN jsonb_build_object('has_draft',false,'safe_to_commit',false,'reason','no_staged_revision'); END IF;
 SELECT * INTO v_baseline FROM change_order_commit.revisions WHERE change_order_id=v_co.id AND organization_id=v_org ORDER BY revision_number DESC LIMIT 1;
 IF NOT FOUND OR v_baseline.revision_number<>v_draft.base_revision_number THEN
  RETURN jsonb_build_object('has_draft',true,'safe_to_commit',false,'reason','stale_committed_baseline');
 END IF;
 -- Compare each staged source line with the immutable committed source by stable ID.
 -- Report material-only arithmetic separately; labor, modifiers, and taxes must be reconciled by the writer.
 SELECT COALESCE(jsonb_agg(jsonb_build_object('line_id',s->>'id','action',s->>'action_type',
 'old_quantity',b->>'new_quantity','new_quantity',s->>'new_quantity',
 'old_unit_price',b->>'new_unit_price','new_unit_price',s->>'new_unit_price',
 'material_delta',CASE WHEN s->>'action_type'='add' THEN
  round(COALESCE((s->>'new_quantity')::numeric,0)*COALESCE((s->>'new_unit_price')::numeric,0)
  -COALESCE((b->>'new_quantity')::numeric,0)*COALESCE((b->>'new_unit_price')::numeric,0),2)
 ELSE NULL END)),'[]'::jsonb),
 COALESCE(sum(CASE WHEN s->>'action_type'='add' THEN
  round(COALESCE((s->>'new_quantity')::numeric,0)*COALESCE((s->>'new_unit_price')::numeric,0)
  -COALESCE((b->>'new_quantity')::numeric,0)*COALESCE((b->>'new_unit_price')::numeric,0),2)
 ELSE 0 END),0),
 count(*)::integer,
 count(*) FILTER(WHERE s->>'action_type'<>'add')::integer
 INTO v_diff,v_delta,v_count,v_unresolved
 FROM jsonb_array_elements(v_draft.draft_lines) s
 JOIN jsonb_array_elements(v_baseline.committed_lines) b ON b->>'id'=s->>'id'
 WHERE s IS DISTINCT FROM b;
 RETURN jsonb_build_object('has_draft',true,'safe_to_commit',false,'base_revision',v_baseline.revision_number,
 'changed_line_count',v_count,'unsupported_action_count',v_unresolved,'material_delta_before_tax_labor_modifiers',v_delta,
 'changed_lines',v_diff,'requires','atomic_material_labor_modifiers_tax_contract_reconciliation');
END;
$function$;
REVOKE ALL ON FUNCTION public.inspect_staged_change_order_revision(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inspect_staged_change_order_revision(uuid) TO authenticated;
