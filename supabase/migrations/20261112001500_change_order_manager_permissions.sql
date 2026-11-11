-- Align change-order manager permissions with actual profile roles; retain approval safety block.
CREATE OR REPLACE FUNCTION public.inspect_change_order_relock_readiness(p_change_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 IF v_org IS NULL OR v_role NOT IN ('admin','manager','office_manager','project_manager') THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.unlock_change_order(p_change_order_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_co public.change_orders%ROWTYPE;
 v_role text;
 v_org uuid;
 v_caller uuid;
BEGIN
 v_caller := auth.uid();
 IF v_caller IS NULL THEN
   RETURN jsonb_build_object('success',false,'error','Not authenticated');
 END IF;
 SELECT role,organization_id INTO v_role,v_org FROM public.profiles WHERE id=v_caller;
 IF v_role NOT IN ('admin','manager','office_manager','project_manager') OR v_org IS NULL THEN
   RETURN jsonb_build_object('success',false,'error','Insufficient permissions to unlock change orders');
 END IF;
 SELECT * INTO v_co FROM public.change_orders
  WHERE id=p_change_order_id AND organization_id=v_org FOR UPDATE;
 IF NOT FOUND THEN
   RETURN jsonb_build_object('success',false,'error','Change order not found');
 END IF;
 IF NOT COALESCE(v_co.is_locked,false) THEN
   RETURN jsonb_build_object('success',false,'error','Change order is not locked');
 END IF;
 -- Never erase an approved customer's authorization or expose already-applied
 -- Sales Order lines to a non-transactional edit. No mutation in this branch.
 IF v_co.status='approved' OR v_co.customer_approved IS TRUE OR
    EXISTS (SELECT 1 FROM change_order_commit.revisions
            WHERE change_order_id=v_co.id) THEN
   RETURN jsonb_build_object('success',false,
    'error','Approved change orders cannot be unlocked safely until committed-revision reconciliation is enabled. Approval and Sales Order values were preserved.',
    'code','committed_unlock_requires_reconciliation');
 END IF;
 -- Preserve the existing legacy behavior for never-approved locked records,
 -- but scope the update and approval deletion to the authenticated tenant.
 UPDATE public.change_orders SET
   status='draft',is_locked=false,is_active=false,
   approved_by=NULL,approved_by_name=NULL,approval_date=NULL,
   approval_notes=NULL,customer_approved=false,
   unlocked_by=v_caller,unlocked_at=now()
 WHERE id=v_co.id AND organization_id=v_org;
 DELETE FROM public.change_order_approvals WHERE change_order_id=v_co.id
   AND organization_id=v_org;
 INSERT INTO public.change_order_history
   (change_order_id,organization_id,action,performed_by,description,snapshot)
 VALUES (v_co.id,v_org,'status_changed',v_caller,
   COALESCE('Change order unlocked: '||NULLIF(p_reason,''),'Change order unlocked'),
   to_jsonb(v_co));
 RETURN jsonb_build_object('success',true);
END;
$function$;
