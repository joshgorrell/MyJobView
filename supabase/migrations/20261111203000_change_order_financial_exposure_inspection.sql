-- Fail-closed, read-only inspection of financial exposure before change-order relock.
-- Does not alter existing contract totals or authorize a commit.
CREATE OR REPLACE FUNCTION public.inspect_change_order_financial_exposure(p_change_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
 v_org uuid;
 v_role text;
 v_co public.change_orders%ROWTYPE;
 v_original numeric;
 v_contract numeric;
 v_approved_total numeric;
 v_locked_total numeric;
 v_unsupported integer;
 v_untraced integer;
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','unauthenticated'); END IF;
 SELECT organization_id,role INTO v_org,v_role FROM public.profiles WHERE id=auth.uid();
 IF v_org IS NULL OR v_role NOT IN ('admin','office_manager','project_manager') THEN
   RETURN jsonb_build_object('ok',false,'reason','unauthorized');
 END IF;
 SELECT * INTO v_co FROM public.change_orders WHERE id=p_change_order_id AND organization_id=v_org;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 SELECT original_contract_total,contract_total INTO v_original,v_contract
   FROM public.sales_orders WHERE id=v_co.sales_order_id AND organization_id=v_org;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','invalid_sales_order'); END IF;
 SELECT COALESCE(sum(CASE WHEN change_amount<0
              THEN change_amount-abs(COALESCE(tax_amount,0))
              ELSE abs(change_amount)+COALESCE(tax_amount,0) END),0)
   INTO v_approved_total
   FROM public.change_orders
   WHERE sales_order_id=v_co.sales_order_id AND organization_id=v_org
     AND status='approved' AND is_billable IS DISTINCT FROM false;
 SELECT COALESCE(sum(CASE WHEN change_amount<0
              THEN change_amount-abs(COALESCE(tax_amount,0))
              ELSE abs(change_amount)+COALESCE(tax_amount,0) END),0)
   INTO v_locked_total
   FROM public.change_orders
   WHERE sales_order_id=v_co.sales_order_id AND organization_id=v_org
     AND status='approved' AND is_locked=true AND is_billable IS DISTINCT FROM false;
 SELECT count(*) FILTER (WHERE action_type NOT IN
       ('add','remove','modify_quantity','modify_price','modify_labor','modify_modifiers')),
        count(*) FILTER (WHERE action_type='add' AND
          NOT EXISTS (SELECT 1 FROM public.proposal_line_items pli
                      WHERE pli.committed_change_order_line_id=cli.id))
   INTO v_unsupported,v_untraced
   FROM public.change_order_line_items cli
   WHERE cli.change_order_id=v_co.id AND cli.organization_id=v_org;
 RETURN jsonb_build_object(
   'ok',true,'changeOrderId',v_co.id,'salesOrderId',v_co.sales_order_id,
   'approved',v_co.status='approved','locked',v_co.is_locked,
   'currentContractTotal',v_contract,
   'currentApprovedBasedTotal',COALESCE(v_original,0)+v_approved_total,
   'lockedOnlyIllustrativeTotal',COALESCE(v_original,0)+v_locked_total,
   'approvedUnlockedExposure',v_approved_total-v_locked_total,
   'unsupportedActionCount',v_unsupported,'untracedAdditionCount',v_untraced,
   'safeToCommit',false,
   'warning','Read-only diagnostic: locked-only total is illustrative; legacy applied lines and committed snapshots must be reconciled before changing billing.'
 );
END;
$$;
REVOKE ALL ON FUNCTION public.inspect_change_order_financial_exposure(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inspect_change_order_financial_exposure(uuid) TO authenticated;
COMMENT ON FUNCTION public.inspect_change_order_financial_exposure(uuid) IS
 'Tenant-scoped read-only financial exposure comparison. Does not approve, lock, apply, commit or export.';
