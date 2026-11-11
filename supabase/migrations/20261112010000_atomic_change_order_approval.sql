-- Approval and application are atomic. Existing auto-lock trigger is preserved.
CREATE OR REPLACE FUNCTION public.approve_and_apply_change_order(p_change_order_id uuid,p_options jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_co public.change_orders%ROWTYPE; v_org uuid; v_role text; v_uid uuid;
BEGIN
 v_uid := auth.uid();
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT organization_id,role::text INTO v_org,v_role FROM public.profiles WHERE id=v_uid;
 IF v_org IS NULL OR v_role NOT IN ('admin','manager','sales') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
 SELECT * INTO v_co FROM public.change_orders WHERE id=p_change_order_id AND organization_id=v_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Change order not found'; END IF;
 IF v_co.status='approved' THEN RAISE EXCEPTION 'Already approved; refusing to replay application'; END IF;
 IF v_co.status NOT IN ('draft','pending_approval') THEN RAISE EXCEPTION 'Change order is not approvable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sales_orders so WHERE so.id=v_co.sales_order_id AND so.organization_id=v_org) THEN RAISE EXCEPTION 'Invalid Sales Order'; END IF;
 UPDATE public.change_orders SET status='approved',is_locked=true,is_active=false,
 approved_by=v_uid,approved_by_name=COALESCE(NULLIF(p_options->>'approved_by_name',''),approved_by_name),
 approval_date=now(),approval_notes=COALESCE(p_options->>'approval_notes',approval_notes),
 is_billable=COALESCE((p_options->>'is_billable')::boolean,is_billable),
 billable_type=CASE WHEN p_options ? 'billable_type' THEN p_options->>'billable_type' ELSE billable_type END,
 show_on_report=COALESCE((p_options->>'show_on_report')::boolean,show_on_report)
 WHERE id=p_change_order_id AND organization_id=v_org;
 -- Any exception in application rolls back approval, removal sync and contract recalculation.
 PERFORM public.apply_change_order(p_change_order_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.approve_and_apply_change_order(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_and_apply_change_order(uuid,jsonb) TO authenticated;
