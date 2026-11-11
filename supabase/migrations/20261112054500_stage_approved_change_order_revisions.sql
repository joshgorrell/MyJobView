-- Staged revisions keep the committed source and live Sales Order untouched while edited.
-- One draft per committed CO, tied to an exact immutable revision number.
CREATE TABLE IF NOT EXISTS change_order_commit.revision_drafts (
 change_order_id uuid PRIMARY KEY REFERENCES public.change_orders(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL,
 base_revision_number bigint NOT NULL,
 draft_lines jsonb NOT NULL CHECK (jsonb_typeof(draft_lines)='array'),
 created_by uuid NOT NULL,
 updated_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON change_order_commit.revision_drafts FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.save_approved_change_order_revision_draft(p_change_order_id uuid,p_lines jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
 v_uid uuid:=auth.uid();v_org uuid;v_role text;v_co public.change_orders%ROWTYPE;
 v_base change_order_commit.revisions%ROWTYPE;v_count bigint;v_unique bigint;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT organization_id,role::text INTO v_org,v_role FROM public.profiles WHERE id=v_uid;
 IF v_org IS NULL OR v_role NOT IN ('admin','manager','office_manager','project_manager') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
 SELECT * INTO v_co FROM public.change_orders WHERE id=p_change_order_id AND organization_id=v_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Change order not found'; END IF;
 IF v_co.status<>'approved' OR v_co.is_locked IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Only approved locked change orders support staged revisions';
 END IF;
 SELECT * INTO v_base FROM change_order_commit.revisions WHERE change_order_id=v_co.id AND organization_id=v_org ORDER BY revision_number DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'No trusted committed baseline; legacy revision requires review'; END IF;
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Revision lines must be an array'; END IF;
 SELECT count(*),count(DISTINCT x->>'id') INTO v_count,v_unique FROM jsonb_array_elements(p_lines) x;
 IF v_count>500 OR v_count<>v_unique OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) x WHERE x->>'id' IS NULL) THEN
  RAISE EXCEPTION 'Invalid, duplicated, or excessive revision lines';
 END IF;
 -- Only previously committed lines can be edited in this first staged revision path.
 -- Add/remove operations need explicit source-line identity allocation in the commit writer.
 IF v_count<>(SELECT count(*) FROM jsonb_array_elements(v_base.committed_lines)) OR EXISTS(
  SELECT 1 FROM jsonb_array_elements(p_lines) x WHERE NOT EXISTS(
   SELECT 1 FROM jsonb_array_elements(v_base.committed_lines) b WHERE b->>'id'=x->>'id')) THEN
  RAISE EXCEPTION 'Source line additions/deletions require full revision reconciliation';
 END IF;
 -- Never accept untrusted changes to ownership, target identity, or action type.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) x JOIN jsonb_array_elements(v_base.committed_lines) b ON b->>'id'=x->>'id'
  WHERE (x - ARRAY['new_quantity','new_unit_price','new_total','change_amount'])
    IS DISTINCT FROM (b - ARRAY['new_quantity','new_unit_price','new_total','change_amount'])) THEN
  RAISE EXCEPTION 'Revision includes unsupported identity or equipment metadata edits';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) x
  WHERE (x->>'new_quantity') IS NOT NULL AND ((x->>'new_quantity')::numeric<=0)
     OR (x->>'new_unit_price') IS NOT NULL AND ((x->>'new_unit_price')::numeric<0)) THEN
  RAISE EXCEPTION 'Invalid revised quantity or unit price';
 END IF;
 INSERT INTO change_order_commit.revision_drafts(change_order_id,organization_id,base_revision_number,draft_lines,created_by,updated_by)
 VALUES(v_co.id,v_org,v_base.revision_number,p_lines,v_uid,v_uid)
 ON CONFLICT(change_order_id) DO UPDATE SET
 draft_lines=excluded.draft_lines,updated_by=excluded.updated_by,updated_at=now(),base_revision_number=excluded.base_revision_number
 WHERE change_order_commit.revision_drafts.organization_id=excluded.organization_id;
 RETURN jsonb_build_object('success',true,'staged',true,'base_revision',v_base.revision_number,'line_count',v_count,
 'sales_order_unchanged',true,'requires_commit',true);
END;
$function$;
REVOKE ALL ON FUNCTION public.save_approved_change_order_revision_draft(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_approved_change_order_revision_draft(uuid,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_approved_change_order_revision_draft(p_change_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_uid uuid:=auth.uid();v_org uuid;v_role text;v_result jsonb;
BEGIN
 SELECT organization_id,role::text INTO v_org,v_role FROM public.profiles WHERE id=v_uid;
 IF v_org IS NULL OR v_role NOT IN ('admin','manager','office_manager','project_manager','sales') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.change_orders WHERE id=p_change_order_id AND organization_id=v_org) THEN RAISE EXCEPTION 'Change order not found'; END IF;
 SELECT jsonb_build_object('base_revision',d.base_revision_number,'lines',d.draft_lines,'updated_at',d.updated_at,'updated_by',d.updated_by)
 INTO v_result FROM change_order_commit.revision_drafts d WHERE d.change_order_id=p_change_order_id AND d.organization_id=v_org;
 RETURN COALESCE(v_result,'null'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_approved_change_order_revision_draft(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_approved_change_order_revision_draft(uuid) TO authenticated;
