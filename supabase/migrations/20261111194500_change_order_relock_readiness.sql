-- Read-only, tenant-scoped readiness check for safe change-order relocking.
-- Explicitly refuses to certify legacy orders lacking immutable provenance.
CREATE OR REPLACE FUNCTION public.inspect_change_order_relock_readiness(p_change_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
 v_org uuid;
 v_role text;
 v_co public.change_orders%ROWTYPE;
 v_additions integer;
 v_traced integer;
 v_committed bigint;
 v_reason text;
BEGIN
 IF (SELECT auth.uid()) IS NULL THEN
   RETURN jsonb_build_object('ready',false,'reason','unauthenticated');
 END IF;
 SELECT organization_id,role INTO v_org,v_role
   FROM public.profiles WHERE id=(SELECT auth.uid());
 IF v_org IS NULL OR v_role NOT IN ('admin','office_manager','project_manager') THEN
   RETURN jsonb_build_object('ready',false,'reason','unauthorized');
 END IF;
 SELECT * INTO v_co FROM public.change_orders
   WHERE id=p_change_order_id AND organization_id=v_org;
 IF NOT FOUND THEN
   RETURN jsonb_build_object('ready',false,'reason','not_found');
 END IF;
 IF v_co.sales_order_id IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.sales_orders so
    WHERE so.id=v_co.sales_order_id AND so.organization_id=v_org
 ) THEN
   RETURN jsonb_build_object('ready',false,'reason','sales_order_binding_invalid');
 END IF;
 SELECT count(*) FILTER (WHERE cli.action_type='add'),
        count(*) FILTER (WHERE cli.action_type='add' AND pli.id IS NOT NULL)
   INTO v_additions,v_traced
   FROM public.change_order_line_items cli
   LEFT JOIN public.proposal_line_items pli
     ON pli.committed_change_order_line_id=cli.id
   WHERE cli.change_order_id=v_co.id AND cli.organization_id=v_org;
 SELECT count(*) INTO v_committed FROM change_order_commit.revisions
   WHERE change_order_id=v_co.id AND organization_id=v_org
     AND sales_order_id=v_co.sales_order_id;
 v_reason := CASE
   WHEN v_co.status <> 'approved' THEN 'customer_approval_required'
   WHEN v_committed=0 THEN 'committed_baseline_missing'
   WHEN v_additions<>v_traced THEN 'addition_provenance_incomplete'
   ELSE 'requires_transactional_reconciliation'
 END;
 RETURN jsonb_build_object('ready',false,'reason',v_reason,
   'approved',v_co.status='approved','locked',v_co.is_locked,
   'committedRevisionCount',v_committed,'additionCount',v_additions,
   'tracedAdditionCount',v_traced);
END;
$$;
REVOKE ALL ON FUNCTION public.inspect_change_order_relock_readiness(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inspect_change_order_relock_readiness(uuid) TO authenticated;
COMMENT ON FUNCTION public.inspect_change_order_relock_readiness(uuid) IS
 'Read-only, fail-closed diagnostic. Never grants permission to lock, modify billing, or export Techsafe equipment.';
