-- Read-only evidence inspection for legacy approved change orders.
-- This intentionally NEVER writes ledger rows or guesses identity from descriptions.
CREATE OR REPLACE FUNCTION public.inspect_change_order_legacy_baseline(p_change_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
 v_org uuid;
 v_role text;
 v_co public.change_orders%ROWTYPE;
 v_proposal uuid;
 v_revision_count bigint;
 v_lines jsonb;
 v_unverified bigint;
BEGIN
 IF auth.uid() IS NULL THEN
   RETURN jsonb_build_object('ok',false,'reason','unauthenticated');
 END IF;
 SELECT organization_id,role INTO v_org,v_role FROM public.profiles WHERE id=auth.uid();
 IF v_org IS NULL OR v_role NOT IN ('admin','office_manager','project_manager') THEN
   RETURN jsonb_build_object('ok',false,'reason','unauthorized');
 END IF;
 SELECT * INTO v_co FROM public.change_orders
  WHERE id=p_change_order_id AND organization_id=v_org;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 SELECT proposal_id INTO v_proposal FROM public.sales_orders
  WHERE id=v_co.sales_order_id AND organization_id=v_org;
 IF NOT FOUND OR v_proposal IS NULL THEN
   RETURN jsonb_build_object('ok',false,'reason','sales_order_proposal_missing');
 END IF;
 SELECT count(*) INTO v_revision_count FROM change_order_commit.revisions
  WHERE change_order_id=v_co.id AND organization_id=v_org;
 WITH evidence AS (
  SELECT cli.id,cli.action_type,cli.product_id,cli.proposal_line_item_id,
         cli.new_quantity,cli.new_unit_price,
         pli.id AS target_id,pli.proposal_id AS target_proposal_id,
         pli.organization_id AS target_org,
         pli.product_id AS target_product_id,
         pli.quantity AS target_quantity,pli.unit_price AS target_unit_price,
         pli.is_hidden AS target_hidden,
         added.id AS addition_id,
         (SELECT count(*) FROM public.proposal_line_items x
           WHERE x.committed_change_order_line_id=cli.id
             AND x.organization_id=v_org AND x.proposal_id=v_proposal) AS traced_additions
    FROM public.change_order_line_items cli
    LEFT JOIN public.proposal_line_items pli
      ON pli.id=cli.proposal_line_item_id
    LEFT JOIN public.proposal_line_items added
      ON added.committed_change_order_line_id=cli.id
     AND added.organization_id=v_org AND added.proposal_id=v_proposal
   WHERE cli.change_order_id=v_co.id AND cli.organization_id=v_org
 ), assessed AS (
 SELECT *,
   CASE
    WHEN action_type='add' AND traced_additions=1 THEN 'stable_addition_provenance'
    WHEN action_type='add' THEN 'addition_provenance_missing'
    WHEN action_type IN ('remove','modify_quantity','modify_price','modify_labor')
      AND target_id IS NOT NULL AND target_proposal_id=v_proposal
      AND target_org=v_org THEN 'target_identity_only'
    WHEN action_type='modify_modifiers' THEN 'modifier_baseline_unverified'
    WHEN action_type IN ('remove','modify_quantity','modify_price','modify_labor')
      THEN 'target_provenance_missing'
    ELSE 'unsupported_action'
   END AS evidence_status
 FROM evidence
 )
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'lineId',id,'action',action_type,'evidence',evidence_status,
   'productId',product_id,'targetLineId',proposal_line_item_id,
   'linkedAdditionId',addition_id,
   'currentTargetQuantity',target_quantity,'currentTargetUnitPrice',target_unit_price,
   'currentTargetHidden',target_hidden
 ) ORDER BY id), '[]'::jsonb),
 count(*) FILTER (WHERE evidence_status <> 'stable_addition_provenance')
 INTO v_lines,v_unverified
 FROM assessed;
 RETURN jsonb_build_object(
  'ok',true,'changeOrderId',v_co.id,'salesOrderId',v_co.sales_order_id,
  'proposalId',v_proposal,'approved',v_co.status='approved',
  'locked',v_co.is_locked,'ledgerRevisionCount',v_revision_count,
  'lineEvidence',v_lines,'unverifiedLineCount',v_unverified,
  'safeToBackfill',false,
  'reason','Existing proposal line identity does not prove original pre-change values or application history. Require verified transaction evidence before creating an immutable baseline.'
 );
END;
$$;
REVOKE ALL ON FUNCTION public.inspect_change_order_legacy_baseline(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inspect_change_order_legacy_baseline(uuid) TO authenticated;
