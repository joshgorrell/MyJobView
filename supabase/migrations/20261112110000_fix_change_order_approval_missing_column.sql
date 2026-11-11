-- Fix production-breaking approval RPC reference to nonexistent change_orders.billable_type.
-- Billing is represented by is_billable; do not add a parallel legacy field.
CREATE OR REPLACE FUNCTION public.approve_and_apply_change_order(p_change_order_id uuid, p_options jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_co public.change_orders%ROWTYPE;
 v_org uuid; v_role text; v_uid uuid;
 v_lines jsonb; v_totals jsonb; v_fingerprint text;
BEGIN
 v_uid := auth.uid();
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT organization_id,role::text INTO v_org,v_role FROM public.profiles WHERE id=v_uid;
 IF v_org IS NULL OR v_role NOT IN ('admin','manager','sales') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
 SELECT * INTO v_co FROM public.change_orders WHERE id=p_change_order_id AND organization_id=v_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Change order not found'; END IF;
 IF v_co.status='approved' THEN RAISE EXCEPTION 'Already approved; refusing to replay application'; END IF;
 IF v_co.status NOT IN ('draft','pending_approval') THEN RAISE EXCEPTION 'Change order is not approvable'; END IF;
 IF EXISTS(SELECT 1 FROM change_order_commit.revisions WHERE change_order_id=p_change_order_id) THEN
   RAISE EXCEPTION 'Committed change order cannot be re-approved through initial approval path';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sales_orders so WHERE so.id=v_co.sales_order_id AND so.organization_id=v_org) THEN RAISE EXCEPTION 'Invalid Sales Order'; END IF;
 -- Serialize source line changes with the approval transaction.
 PERFORM 1 FROM public.change_order_line_items WHERE change_order_id=p_change_order_id AND organization_id=v_org FOR UPDATE;
 UPDATE public.change_orders SET status='approved',is_locked=true,is_active=false,
 approved_by=v_uid,approved_by_name=COALESCE(NULLIF(p_options->>'approved_by_name',''),approved_by_name),
 approval_date=now(),approval_notes=COALESCE(p_options->>'approval_notes',approval_notes),
 is_billable=COALESCE((p_options->>'is_billable')::boolean,is_billable),
 show_on_report=COALESCE((p_options->>'show_on_report')::boolean,show_on_report)
 WHERE id=p_change_order_id AND organization_id=v_org;
 PERFORM public.apply_change_order(p_change_order_id);
 -- Snapshot the exact committed source, including stable source and target line identities.
 SELECT COALESCE(jsonb_agg(to_jsonb(cli) ORDER BY cli.sort_order NULLS LAST,cli.created_at,cli.id),'[]'::jsonb)
 INTO v_lines FROM public.change_order_line_items cli
 WHERE cli.change_order_id=p_change_order_id AND cli.organization_id=v_org;
 SELECT jsonb_build_object('change_amount',co.change_amount,'tax_amount',co.tax_amount,
   'is_billable',co.is_billable,'new_contract_total',co.new_contract_total)
 INTO v_totals FROM public.change_orders co WHERE co.id=p_change_order_id;
 v_fingerprint := md5(v_lines::text || ':' || v_totals::text);
 INSERT INTO change_order_commit.revisions
 (organization_id,change_order_id,sales_order_id,revision_number,committed_lines,committed_totals,source_fingerprint,committed_by)
 VALUES(v_org,p_change_order_id,v_co.sales_order_id,1,v_lines,v_totals,v_fingerprint,v_uid);
END;
$function$
;
