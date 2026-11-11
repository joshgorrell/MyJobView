-- Prevent two editors from silently overwriting each other's approved CO correction draft.
-- Revision drafts remain separate from live Sales Orders.
ALTER TABLE change_order_commit.revision_drafts
 ADD COLUMN IF NOT EXISTS edit_version bigint NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.save_approved_change_order_revision_draft_if_current(
 p_change_order_id uuid,p_lines jsonb,p_expected_edit_version bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_uid uuid:=auth.uid();v_org uuid;v_role text;v_co public.change_orders%ROWTYPE;
 v_base change_order_commit.revisions%ROWTYPE;v_draft change_order_commit.revision_drafts%ROWTYPE;
 v_count bigint;v_unique bigint;v_next bigint;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT organization_id,role::text INTO v_org,v_role FROM public.profiles WHERE id=v_uid;
 IF v_org IS NULL OR v_role NOT IN ('admin','manager','office_manager','project_manager') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
 SELECT * INTO v_co FROM public.change_orders WHERE id=p_change_order_id AND organization_id=v_org FOR UPDATE;
 IF NOT FOUND OR v_co.status<>'approved' OR v_co.is_locked IS DISTINCT FROM true THEN RAISE EXCEPTION 'Approved locked change order required'; END IF;
 SELECT * INTO v_base FROM change_order_commit.revisions WHERE change_order_id=v_co.id AND organization_id=v_org ORDER BY revision_number DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'No trusted committed baseline'; END IF;
 SELECT * INTO v_draft FROM change_order_commit.revision_drafts WHERE change_order_id=v_co.id AND organization_id=v_org FOR UPDATE;
 IF FOUND THEN
  IF p_expected_edit_version IS NULL OR p_expected_edit_version<>v_draft.edit_version THEN RAISE EXCEPTION 'Revision draft changed; reload before saving'; END IF;
  IF v_draft.base_revision_number<>v_base.revision_number THEN RAISE EXCEPTION 'Committed baseline changed; reload before saving'; END IF;
 ELSE
  IF p_expected_edit_version IS NOT NULL AND p_expected_edit_version<>0 THEN RAISE EXCEPTION 'Revision draft changed; reload before saving'; END IF;
 END IF;
 PERFORM public.validate_change_order_revision_draft_lines(p_lines);
 SELECT count(*),count(DISTINCT x->>'id') INTO v_count,v_unique FROM jsonb_array_elements(p_lines) x;
 IF v_count>500 OR v_count<>v_unique OR v_count<>(SELECT count(*) FROM jsonb_array_elements(v_base.committed_lines)) THEN RAISE EXCEPTION 'Invalid revision source line set'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) x WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_base.committed_lines) b WHERE b->>'id'=x->>'id')) THEN RAISE EXCEPTION 'Unrecognized source line'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) x JOIN jsonb_array_elements(v_base.committed_lines) b ON b->>'id'=x->>'id' WHERE
 (x-ARRAY['new_quantity','new_unit_price','new_total','change_amount']) IS DISTINCT FROM
 (b-ARRAY['new_quantity','new_unit_price','new_total','change_amount'])) THEN RAISE EXCEPTION 'Unsupported source metadata change'; END IF;
 IF v_draft.change_order_id IS NULL THEN
  INSERT INTO change_order_commit.revision_drafts(change_order_id,organization_id,base_revision_number,draft_lines,created_by,updated_by,edit_version)
  VALUES(v_co.id,v_org,v_base.revision_number,p_lines,v_uid,v_uid,1);
  v_next:=1;
 ELSE
  UPDATE change_order_commit.revision_drafts SET draft_lines=p_lines,updated_by=v_uid,updated_at=now(),edit_version=edit_version+1
  WHERE change_order_id=v_co.id AND organization_id=v_org RETURNING edit_version INTO v_next;
 END IF;
 RETURN jsonb_build_object('success',true,'staged',true,'edit_version',v_next,'base_revision',v_base.revision_number,'requires_commit',true);
END;
$function$;
REVOKE ALL ON FUNCTION public.save_approved_change_order_revision_draft_if_current(uuid,jsonb,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_approved_change_order_revision_draft_if_current(uuid,jsonb,bigint) TO authenticated;

-- Existing callers cannot be allowed to bypass optimistic locking by using the old RPC.
REVOKE ALL ON FUNCTION public.save_approved_change_order_revision_draft(uuid,jsonb) FROM authenticated;

CREATE OR REPLACE FUNCTION public.get_approved_change_order_revision_draft(p_change_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_uid uuid:=auth.uid();v_org uuid;v_role text;v_result jsonb;
BEGIN
 SELECT organization_id,role::text INTO v_org,v_role FROM public.profiles WHERE id=v_uid;
 IF v_org IS NULL OR v_role NOT IN ('admin','manager','office_manager','project_manager','sales') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.change_orders WHERE id=p_change_order_id AND organization_id=v_org) THEN RAISE EXCEPTION 'Change order not found'; END IF;
 SELECT jsonb_build_object('base_revision',d.base_revision_number,'lines',d.draft_lines,'edit_version',d.edit_version,'updated_at',d.updated_at,'updated_by',d.updated_by)
 INTO v_result FROM change_order_commit.revision_drafts d WHERE d.change_order_id=p_change_order_id AND d.organization_id=v_org;
 RETURN COALESCE(v_result,'null'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_approved_change_order_revision_draft(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_approved_change_order_revision_draft(uuid) TO authenticated;
