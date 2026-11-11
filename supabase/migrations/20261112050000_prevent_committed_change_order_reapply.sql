-- Preserve the existing apply implementation while blocking replay after the immutable first commit.
CREATE OR REPLACE FUNCTION public.apply_change_order(p_change_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_co          change_orders%ROWTYPE;
v_item        change_order_line_items%ROWTYPE;
v_proposal_id uuid;
v_org uuid;
v_role text;
BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
SELECT organization_id,role::text INTO v_org,v_role FROM public.profiles WHERE id=auth.uid();
IF v_org IS NULL OR v_role NOT IN ('admin','manager','sales') THEN RAISE EXCEPTION 'Not authorized'; END IF;
-- Load the change order
SELECT * INTO v_co
FROM change_orders
WHERE id = p_change_order_id AND organization_id=v_org FOR UPDATE;

IF NOT FOUND THEN
RAISE EXCEPTION 'Change order % not found', p_change_order_id;
END IF;

-- The initial approval transaction calls this BEFORE inserting revision 1.
-- After a revision is committed, re-applying source actions can overwrite
-- independently edited proposal lines and double-process financial effects.
IF EXISTS (SELECT 1 FROM change_order_commit.revisions r
           WHERE r.change_order_id=p_change_order_id AND r.organization_id=v_org) THEN
 RAISE EXCEPTION 'Change order already committed; use atomic revision reconciliation';
END IF;

IF v_co.status <> 'approved' OR v_co.is_locked IS DISTINCT FROM true THEN
RAISE EXCEPTION 'Change order % must be in approved status to apply (current: %)',
p_change_order_id, v_co.status;
END IF;

-- Resolve the parent proposal from the sales order
SELECT proposal_id INTO v_proposal_id
FROM sales_orders
WHERE id = v_co.sales_order_id AND organization_id=v_org;

IF v_proposal_id IS NULL THEN RAISE EXCEPTION 'Sales Order proposal not found'; END IF;
-- Process each line item action
FOR v_item IN
SELECT *
FROM change_order_line_items
WHERE change_order_id = p_change_order_id AND organization_id=v_org
ORDER BY sort_order NULLS LAST, created_at
LOOP

IF v_item.action_type = 'remove' THEN
-- Permanently hide the removed line item
UPDATE proposal_line_items
SET    is_hidden  = true,
updated_at = now()
WHERE  id = v_item.proposal_line_item_id AND proposal_id=v_proposal_id AND organization_id=v_org;

ELSIF v_item.action_type = 'add' THEN
IF NOT EXISTS (SELECT 1 FROM public.proposal_line_items WHERE committed_change_order_line_id=v_item.id AND proposal_id=v_proposal_id AND organization_id=v_org) THEN
 IF EXISTS (SELECT 1 FROM public.proposal_line_items WHERE proposal_id=v_proposal_id AND organization_id=v_org AND product_id IS NOT DISTINCT FROM v_item.product_id AND description=COALESCE(v_item.product_description,v_item.product_name) AND unit_price=v_item.new_unit_price AND quantity=v_item.new_quantity AND committed_change_order_line_id IS NULL) THEN
 RAISE EXCEPTION 'Ambiguous legacy addition, refusing duplicate line %',v_item.id;
 END IF;
 INSERT INTO public.proposal_line_items (proposal_id,product_id,description,quantity,unit_price,line_total,is_taxable,item_type,labor_phase_id,sort_order,organization_id,committed_change_order_line_id,created_at,updated_at)
 VALUES(v_proposal_id,v_item.product_id,COALESCE(v_item.product_description,v_item.product_name),v_item.new_quantity,v_item.new_unit_price,ROUND(v_item.new_quantity*v_item.new_unit_price,2),COALESCE(v_item.is_taxable,true),v_item.item_type,v_item.labor_phase_id,v_item.sort_order,v_org,v_item.id,now(),now());
END IF;

ELSIF v_item.action_type IN ('modify_quantity', 'modify_price') THEN
UPDATE proposal_line_items
SET
quantity   = CASE WHEN v_item.action_type = 'modify_quantity'
THEN v_item.new_quantity ELSE quantity END,
unit_price = CASE WHEN v_item.action_type = 'modify_price'
THEN v_item.new_unit_price ELSE unit_price END,
line_total = ROUND(
CASE WHEN v_item.action_type = 'modify_quantity'
THEN v_item.new_quantity ELSE quantity END
*
CASE WHEN v_item.action_type = 'modify_price'
THEN v_item.new_unit_price ELSE unit_price END
, 2),
updated_at = now()
WHERE id = v_item.proposal_line_item_id AND proposal_id=v_proposal_id AND organization_id=v_org;

ELSIF v_item.action_type = 'modify_labor' THEN
UPDATE proposal_line_items
SET
labor_hours = v_item.labor_hours,
labor_rate  = v_item.labor_rate,
labor_total = v_item.new_labor_total,
updated_at  = now()
WHERE id = v_item.proposal_line_item_id AND proposal_id=v_proposal_id AND organization_id=v_org;

-- modify_modifiers: no per-line-item change needed
END IF;

END LOOP;

-- Lock the CO: mark is_active = false so it becomes historical
UPDATE change_orders
SET    is_active  = false,
updated_at = now()
WHERE  id = p_change_order_id AND organization_id=v_org;

-- Recalculate proposal totals if helper function exists
IF v_proposal_id IS NOT NULL THEN
BEGIN
PERFORM calculate_proposal_totals(v_proposal_id);
EXCEPTION WHEN undefined_function THEN
NULL;
END;
END IF;

END;
$function$

