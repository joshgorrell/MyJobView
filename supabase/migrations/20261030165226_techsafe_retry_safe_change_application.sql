-- Opt-in internal engine. No current UI/RPC is redirected to this function.
-- The future atomic creation/finalization flow must register its own new COs.
CREATE TABLE techsafe_source.managed_change_orders (
  change_order_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  sales_order_id uuid NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE techsafe_source.change_applications (
  change_order_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  sales_order_id uuid NOT NULL,
  source_payload jsonb NOT NULL,
  result jsonb NOT NULL,
  invalidated_at timestamptz,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE techsafe_source.change_application_lines (
  change_order_line_item_id uuid PRIMARY KEY,
  change_order_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  proposal_line_item_id uuid,
  action_type text NOT NULL
);
ALTER TABLE techsafe_source.managed_change_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE techsafe_source.change_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE techsafe_source.change_application_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE techsafe_source.managed_change_orders,techsafe_source.change_applications,
  techsafe_source.change_application_lines FROM PUBLIC,anon,authenticated;
CREATE INDEX change_application_lines_co_idx ON techsafe_source.change_application_lines(change_order_id);

-- An applied identity cannot be silently re-used after unlock/rejection/delete.
-- This changes only internal receipts, never the existing change-order row.
CREATE FUNCTION techsafe_source.invalidate_change_application()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  UPDATE techsafe_source.change_applications SET invalidated_at=coalesce(invalidated_at,now())
    WHERE change_order_id=OLD.id AND organization_id=OLD.organization_id;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.invalidate_change_application() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER invalidate_techsafe_change_application_status AFTER UPDATE OF status ON public.change_orders
  FOR EACH ROW WHEN (OLD.status='approved' AND NEW.status IS DISTINCT FROM 'approved')
  EXECUTE FUNCTION techsafe_source.invalidate_change_application();
CREATE TRIGGER invalidate_techsafe_change_application_delete AFTER DELETE ON public.change_orders
  FOR EACH ROW EXECUTE FUNCTION techsafe_source.invalidate_change_application();

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.change_order_line_items'::regclass
    AND confrelid='public.change_orders'::regclass AND contype='f' AND NOT condeferrable) THEN
    RAISE EXCEPTION 'Non-deferrable change-order line parent constraint required';
  END IF;
END $$;

CREATE FUNCTION techsafe_source.apply_managed_change_order(p_change_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE registration techsafe_source.managed_change_orders%ROWTYPE;
  co public.change_orders%ROWTYPE; sales public.sales_orders%ROWTYPE;
  item public.change_order_line_items%ROWTYPE; prior techsafe_source.change_applications%ROWTYPE;
  payload jsonb; mappings jsonb:='[]'::jsonb; target uuid; result jsonb;
  current_quantity numeric; current_price numeric;
BEGIN
  SELECT * INTO registration FROM techsafe_source.managed_change_orders WHERE change_order_id=p_change_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Change order is not managed by the atomic application flow' USING ERRCODE='55000'; END IF;
  IF auth.uid() IS NULL THEN
    IF current_setting('role',true) IN ('anon','authenticated') OR coalesce(current_setting('request.jwt.claim.role',true),'') IN ('anon','authenticated') THEN
      RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
    END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=registration.organization_id AND p.is_active IS TRUE) THEN
    RAISE EXCEPTION 'Active user in the order organization required' USING ERRCODE='42501';
  END IF;
  -- Serialize all managed COs belonging to the same sales order.
  SELECT * INTO sales FROM public.sales_orders WHERE id=registration.sales_order_id
    AND organization_id=registration.organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registered sales order is unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO co FROM public.change_orders WHERE id=p_change_order_id FOR UPDATE;
  IF NOT FOUND OR co.organization_id IS DISTINCT FROM registration.organization_id OR co.sales_order_id IS DISTINCT FROM sales.id THEN
    RAISE EXCEPTION 'Change order does not match registered source' USING ERRCODE='42501';
  END IF;
  IF co.status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Approved change order required' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.proposals WHERE id=sales.proposal_id AND organization_id=co.organization_id) THEN
    RAISE EXCEPTION 'Parent proposal does not match order organization' USING ERRCODE='42501';
  END IF;
  -- With the non-deferrable parent FK, the parent lock also prevents a new
  -- source line from being committed while this application is in progress.
  PERFORM 1 FROM public.change_order_line_items WHERE change_order_id=co.id ORDER BY id FOR UPDATE;
  SELECT jsonb_build_object('organization_id',co.organization_id,'sales_order_id',co.sales_order_id,
    'proposal_id',sales.proposal_id,'items',coalesce(jsonb_agg(to_jsonb(source) ORDER BY source.sort_order NULLS LAST,source.created_at,source.id),'[]'::jsonb))
  INTO payload FROM public.change_order_line_items source WHERE source.change_order_id=co.id;
  SELECT * INTO prior FROM techsafe_source.change_applications WHERE change_order_id=co.id;
  IF FOUND THEN
    IF prior.invalidated_at IS NOT NULL OR prior.organization_id IS DISTINCT FROM co.organization_id OR prior.sales_order_id IS DISTINCT FROM sales.id OR prior.source_payload IS DISTINCT FROM payload THEN
      RAISE EXCEPTION 'Applied change-order payload changed; a versioned amendment is required' USING ERRCODE='22023';
    END IF;
    RETURN prior.result || jsonb_build_object('application_status','duplicate');
  END IF;
  FOR item IN SELECT * FROM public.change_order_line_items WHERE change_order_id=co.id
    ORDER BY sort_order NULLS LAST,created_at,id LOOP
    IF item.organization_id IS DISTINCT FROM co.organization_id THEN RAISE EXCEPTION 'Change line organization mismatch' USING ERRCODE='42501'; END IF;
    IF item.action_type IS NULL OR item.action_type NOT IN ('add','remove','modify_quantity','modify_price','modify_labor','modify_modifiers') THEN
      RAISE EXCEPTION 'Unsupported change action' USING ERRCODE='22023';
    END IF;
    IF item.product_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.products WHERE id=item.product_id AND organization_id=co.organization_id) THEN
      RAISE EXCEPTION 'Product is not available in order organization' USING ERRCODE='42501';
    END IF;
    target:=NULL;
    IF item.action_type NOT IN ('add','modify_modifiers') THEN
      SELECT id,quantity,unit_price INTO target,current_quantity,current_price FROM public.proposal_line_items WHERE id=item.proposal_line_item_id
        AND proposal_id=sales.proposal_id AND organization_id=co.organization_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Target line does not match order scope' USING ERRCODE='42501'; END IF;
    END IF;
    IF item.action_type='modify_quantity' AND (current_price IS NULL OR current_price<0 OR current_price::text IN ('NaN','Infinity','-Infinity')) THEN
      RAISE EXCEPTION 'Target price must be verified before quantity change' USING ERRCODE='22023';
    END IF;
    IF item.action_type='modify_price' AND (current_quantity IS NULL OR current_quantity<0 OR current_quantity::text IN ('NaN','Infinity','-Infinity')) THEN
      RAISE EXCEPTION 'Target quantity must be verified before price change' USING ERRCODE='22023';
    END IF;
    IF item.action_type IN ('add','modify_quantity') AND (item.new_quantity IS NULL OR item.new_quantity<0 OR item.new_quantity::text IN ('NaN','Infinity','-Infinity')) THEN
      RAISE EXCEPTION 'Valid nonnegative quantity required' USING ERRCODE='22023';
    END IF;
    IF item.action_type IN ('add','modify_price') AND (item.new_unit_price IS NULL OR item.new_unit_price<0 OR item.new_unit_price::text IN ('NaN','Infinity','-Infinity')) THEN
      RAISE EXCEPTION 'Valid nonnegative price required' USING ERRCODE='22023';
    END IF;
    IF item.action_type='modify_labor' AND EXISTS(SELECT 1
      FROM unnest(ARRAY[item.labor_hours,item.labor_rate,item.new_labor_total]) AS amount(value)
      WHERE value IS NULL OR value<0 OR value::text IN ('NaN','Infinity','-Infinity')) THEN
      RAISE EXCEPTION 'Valid nonnegative labor values required' USING ERRCODE='22023';
    END IF;
    IF item.action_type='add' THEN
      -- Distinct source IDs always produce distinct equipment lines, even when
      -- product, quantity, description and value happen to be identical.
      INSERT INTO public.proposal_line_items(proposal_id,product_id,description,quantity,unit_price,line_total,
        is_taxable,item_type,labor_phase_id,sort_order,organization_id,created_at,updated_at)
      VALUES(sales.proposal_id,item.product_id,coalesce(item.product_description,item.product_name),item.new_quantity,
        item.new_unit_price,round(item.new_quantity*item.new_unit_price,2),coalesce(item.is_taxable,true),item.item_type,
        item.labor_phase_id,item.sort_order,co.organization_id,now(),now()) RETURNING id INTO target;
    ELSIF item.action_type='remove' THEN
      UPDATE public.proposal_line_items SET is_hidden=true,updated_at=now() WHERE id=target;
      PERFORM techsafe_source.record_scope_removal(co.id,item.id,target);
    ELSIF item.action_type='modify_quantity' THEN
      UPDATE public.proposal_line_items SET quantity=item.new_quantity,line_total=round(item.new_quantity*unit_price,2),updated_at=now() WHERE id=target;
    ELSIF item.action_type='modify_price' THEN
      UPDATE public.proposal_line_items SET unit_price=item.new_unit_price,line_total=round(quantity*item.new_unit_price,2),updated_at=now() WHERE id=target;
    ELSIF item.action_type='modify_labor' THEN
      UPDATE public.proposal_line_items SET labor_hours=item.labor_hours,labor_rate=item.labor_rate,labor_total=item.new_labor_total,updated_at=now() WHERE id=target;
    END IF;
    -- modify_modifiers retains the established no per-line scope mutation;
    -- the future finalizer must coordinate header/tax/modifier calculations.
    INSERT INTO techsafe_source.change_application_lines(change_order_line_item_id,change_order_id,organization_id,proposal_line_item_id,action_type)
    VALUES(item.id,co.id,co.organization_id,target,item.action_type);
    mappings:=mappings||jsonb_build_array(jsonb_build_object('source_line_id',item.id,'proposal_line_id',target,'action',item.action_type));
  END LOOP;
  UPDATE public.change_orders SET is_active=false,updated_at=now() WHERE id=co.id;
  -- Failure must roll back equipment and receipts; no silently missing totals.
  PERFORM public.calculate_proposal_totals(sales.proposal_id);
  result:=jsonb_build_object('application_status','applied','change_order_id',co.id,'lines',mappings);
  INSERT INTO techsafe_source.change_applications(change_order_id,organization_id,sales_order_id,source_payload,result)
  VALUES(co.id,co.organization_id,sales.id,payload,result);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.apply_managed_change_order(uuid) FROM PUBLIC,anon,authenticated;
