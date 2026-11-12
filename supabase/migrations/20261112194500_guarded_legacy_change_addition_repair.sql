-- Explicit, admin-only recovery for one legacy approved change-order addition.
-- Installs a function only. No customer records are changed by this migration.
-- Never call automatically from Techsafe delivery or source certification.
CREATE OR REPLACE FUNCTION public.repair_legacy_approved_change_addition(
  p_change_order_id uuid, p_change_line_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid;
  v_role text;
  v_co public.change_orders%ROWTYPE;
  v_line public.change_order_line_items%ROWTYPE;
  v_proposal_id uuid;
  v_existing uuid;
  v_inserted uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT organization_id, role::text INTO v_org,v_role
    FROM public.profiles WHERE id=auth.uid();
  IF v_org IS NULL OR v_role <> 'admin' THEN
    RAISE EXCEPTION 'Dealer admin required';
  END IF;
  SELECT * INTO v_co FROM public.change_orders
    WHERE id=p_change_order_id AND organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Change order not found'; END IF;
  IF v_co.status <> 'approved' OR v_co.is_active IS DISTINCT FROM false
     OR v_co.is_locked IS DISTINCT FROM true OR v_co.approval_date IS NULL
     OR (v_co.requires_customer_approval IS TRUE AND v_co.customer_approved IS DISTINCT FROM true)
  THEN RAISE EXCEPTION 'Change order not proven approved and applied'; END IF;
  SELECT proposal_id INTO v_proposal_id FROM public.sales_orders
    WHERE id=v_co.sales_order_id AND organization_id=v_org FOR UPDATE;
  IF v_proposal_id IS NULL OR v_proposal_id IS DISTINCT FROM v_co.proposal_id
  THEN RAISE EXCEPTION 'Sales Order scope mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM change_order_commit.revisions
      WHERE change_order_id=p_change_order_id AND organization_id=v_org)
  THEN RAISE EXCEPTION 'Revision-tracked order must use normal reconciliation'; END IF;
  SELECT * INTO v_line FROM public.change_order_line_items
    WHERE id=p_change_line_id AND change_order_id=p_change_order_id
      AND organization_id=v_org AND action_type='add' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Approved addition not found'; END IF;
  IF v_line.new_quantity IS NULL OR v_line.new_quantity <= 0
     OR v_line.new_unit_price IS NULL OR v_line.new_unit_price < 0
     OR COALESCE(v_line.product_description,v_line.product_name) IS NULL
  THEN RAISE EXCEPTION 'Addition has invalid sold values'; END IF;
  -- Prevent concurrent duplicate repairs; also check existing legacy unlinked
  -- rows matching the exact addition before inserting.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_proposal_id::text,0));
  SELECT id INTO v_existing FROM public.proposal_line_items
    WHERE organization_id=v_org AND proposal_id=v_proposal_id
      AND committed_change_order_line_id=p_change_line_id LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Addition already linked; no repair performed';
  END IF;
  SELECT id INTO v_existing FROM public.proposal_line_items
    WHERE organization_id=v_org AND proposal_id=v_proposal_id
      AND product_id IS NOT DISTINCT FROM v_line.product_id
      AND description=COALESCE(v_line.product_description,v_line.product_name)
      AND unit_price=v_line.new_unit_price AND quantity=v_line.new_quantity
      AND committed_change_order_line_id IS NULL LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Possible existing legacy addition; manual review required';
  END IF;
  INSERT INTO public.proposal_line_items(
    proposal_id,product_id,description,quantity,unit_price,line_total,
    is_taxable,item_type,labor_phase_id,sort_order,organization_id,
    committed_change_order_line_id,created_at,updated_at)
  VALUES(v_proposal_id,v_line.product_id,
    COALESCE(v_line.product_description,v_line.product_name),
    v_line.new_quantity,v_line.new_unit_price,
    ROUND(v_line.new_quantity*v_line.new_unit_price,2),
    COALESCE(v_line.is_taxable,true),v_line.item_type,v_line.labor_phase_id,
    v_line.sort_order,v_org,v_line.id,now(),now())
  RETURNING id INTO v_inserted;
  PERFORM public.calculate_proposal_totals(v_proposal_id);
  RETURN v_inserted;
END;
$$;
REVOKE ALL ON FUNCTION public.repair_legacy_approved_change_addition(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.repair_legacy_approved_change_addition(uuid,uuid)
  TO authenticated;
COMMENT ON FUNCTION public.repair_legacy_approved_change_addition(uuid,uuid) IS
  'Explicit dealer-admin recovery only; requires reviewed approved legacy addition IDs. Not called by Techsafe.';
