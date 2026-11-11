-- Explicit, narrow historical repair: approved+locked removals only.
-- No changes to CO approval, financial amounts, contract totals, or immutable revision ledger.
CREATE OR REPLACE FUNCTION public.reconcile_approved_change_order_removals(p_change_order_id uuid, p_dry_run boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 v_org uuid;
 v_role text;
 v_co public.change_orders%ROWTYPE;
 v_proposal uuid;
 v_total integer;
 v_eligible integer;
 v_already integer;
 v_conflict integer;
 v_changed integer := 0;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT organization_id,role::text INTO v_org,v_role
 FROM public.profiles WHERE id=auth.uid();
 IF v_org IS NULL OR v_role NOT IN ('admin','manager') THEN
   RAISE EXCEPTION 'Not authorized to reconcile change orders';
 END IF;
 SELECT * INTO v_co FROM public.change_orders
 WHERE id=p_change_order_id AND organization_id=v_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Change order not found'; END IF;
 IF v_co.status IS DISTINCT FROM 'approved' OR v_co.is_locked IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Change order must be approved and locked';
 END IF;
 SELECT proposal_id INTO v_proposal FROM public.sales_orders
 WHERE id=v_co.sales_order_id AND organization_id=v_org FOR UPDATE;
 IF NOT FOUND OR v_proposal IS NULL THEN
   RAISE EXCEPTION 'Sales order proposal unavailable';
 END IF;
 -- Lock all candidate target rows before validating; fail as a whole on any mismatch.
 PERFORM 1 FROM public.proposal_line_items pli
 WHERE pli.id IN (
   SELECT cli.proposal_line_item_id FROM public.change_order_line_items cli
   WHERE cli.change_order_id=v_co.id AND cli.action_type='remove'
 ) FOR UPDATE;
 WITH assessed AS (
 SELECT cli.id,
   CASE WHEN pli.id IS NULL OR pli.proposal_id IS DISTINCT FROM v_proposal
       OR pli.organization_id IS DISTINCT FROM v_org
       OR cli.proposal_line_item_id IS NULL
       OR cli.original_quantity IS NULL OR cli.original_unit_price IS NULL
       OR pli.quantity IS DISTINCT FROM cli.original_quantity
       OR pli.unit_price IS DISTINCT FROM cli.original_unit_price
       THEN 'conflict'
       WHEN pli.is_hidden IS TRUE THEN 'already'
       ELSE 'eligible' END outcome
 FROM public.change_order_line_items cli
 LEFT JOIN public.proposal_line_items pli ON pli.id=cli.proposal_line_item_id
 WHERE cli.change_order_id=v_co.id AND cli.organization_id=v_org
   AND cli.action_type='remove'
 )
 SELECT count(*)::integer,
        count(*) FILTER (WHERE outcome='eligible')::integer,
        count(*) FILTER (WHERE outcome='already')::integer,
        count(*) FILTER (WHERE outcome='conflict')::integer
 INTO v_total,v_eligible,v_already,v_conflict FROM assessed;
 IF v_total=0 THEN
   RETURN jsonb_build_object('safe',true,'dryRun',p_dry_run,'eligible',0,'alreadyHidden',0,'changed',0);
 END IF;
 IF v_conflict>0 THEN
   RETURN jsonb_build_object('safe',false,'reason','target_identity_or_original_values_mismatch',
    'dryRun',p_dry_run,'total',v_total,'conflicts',v_conflict,'changed',0);
 END IF;
 IF NOT p_dry_run THEN
   UPDATE public.proposal_line_items pli
   SET is_hidden=true,updated_at=now()
   FROM public.change_order_line_items cli
   WHERE cli.change_order_id=v_co.id AND cli.organization_id=v_org
     AND cli.action_type='remove' AND cli.proposal_line_item_id=pli.id
     AND pli.proposal_id=v_proposal AND pli.organization_id=v_org
     AND pli.is_hidden IS DISTINCT FROM true;
   GET DIAGNOSTICS v_changed=ROW_COUNT;
   IF v_changed <> v_eligible THEN
     RAISE EXCEPTION 'Removal reconciliation changed unexpected number of rows';
   END IF;
 END IF;
 RETURN jsonb_build_object('safe',true,'dryRun',p_dry_run,'total',v_total,
    'eligible',v_eligible,'alreadyHidden',v_already,'changed',v_changed,
    'financialAmountsUnchanged',true);
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_approved_change_order_removals(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reconcile_approved_change_order_removals(uuid,boolean) TO authenticated;
