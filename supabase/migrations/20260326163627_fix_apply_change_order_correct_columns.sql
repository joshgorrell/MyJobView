/*
  # Fix apply_change_order function — use correct column names

  ## Summary
  The previous migration used incorrect column names. This replaces the function
  with correct schema references:
  - `proposal_line_items` uses `is_taxable` (not `taxable`), no `room` column (uses `room_id`),
    no `notes` or `install_notes` columns, and no `change_order_line_item_id` column.
  - For `add` items we match on `product_id + proposal_id + description` to guard idempotency.
  - For `modify_labor` we update `labor_hours`, `labor_rate`, `labor_total`.
*/

CREATE OR REPLACE FUNCTION apply_change_order(p_change_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_co          change_orders%ROWTYPE;
  v_item        change_order_line_items%ROWTYPE;
  v_proposal_id uuid;
BEGIN
  -- Load the change order
  SELECT * INTO v_co
  FROM change_orders
  WHERE id = p_change_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Change order % not found', p_change_order_id;
  END IF;

  IF v_co.status <> 'approved' THEN
    RAISE EXCEPTION 'Change order % must be in approved status to apply (current: %)',
      p_change_order_id, v_co.status;
  END IF;

  -- Resolve the parent proposal from the sales order
  SELECT proposal_id INTO v_proposal_id
  FROM sales_orders
  WHERE id = v_co.sales_order_id;

  -- Process each line item action
  FOR v_item IN
    SELECT *
    FROM change_order_line_items
    WHERE change_order_id = p_change_order_id
    ORDER BY sort_order NULLS LAST, created_at
  LOOP

    IF v_item.action_type = 'remove' THEN
      -- Permanently hide the removed line item
      UPDATE proposal_line_items
      SET    is_hidden  = true,
             updated_at = now()
      WHERE  id = v_item.proposal_line_item_id;

    ELSIF v_item.action_type = 'add' THEN
      -- Insert a new line item on the proposal (skip if somehow already there)
      IF v_proposal_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM proposal_line_items
            WHERE proposal_id   = v_proposal_id
              AND product_id    IS NOT DISTINCT FROM v_item.product_id
              AND description   = COALESCE(v_item.product_description, v_item.product_name)
              AND unit_price    = v_item.new_unit_price
              AND quantity      = v_item.new_quantity
      ) THEN
        INSERT INTO proposal_line_items (
          proposal_id,
          product_id,
          description,
          quantity,
          unit_price,
          line_total,
          is_taxable,
          item_type,
          labor_phase_id,
          sort_order,
          organization_id,
          created_at,
          updated_at
        ) VALUES (
          v_proposal_id,
          v_item.product_id,
          COALESCE(v_item.product_description, v_item.product_name),
          v_item.new_quantity,
          v_item.new_unit_price,
          ROUND(v_item.new_quantity * v_item.new_unit_price, 2),
          COALESCE(v_item.is_taxable, true),
          v_item.item_type,
          v_item.labor_phase_id,
          v_item.sort_order,
          v_co.organization_id,
          now(),
          now()
        );
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
      WHERE id = v_item.proposal_line_item_id;

    ELSIF v_item.action_type = 'modify_labor' THEN
      UPDATE proposal_line_items
      SET
        labor_hours = v_item.labor_hours,
        labor_rate  = v_item.labor_rate,
        labor_total = v_item.new_labor_total,
        updated_at  = now()
      WHERE id = v_item.proposal_line_item_id;

    -- modify_modifiers: no per-line-item change needed
    END IF;

  END LOOP;

  -- Lock the CO: mark is_active = false so it becomes historical
  UPDATE change_orders
  SET    is_active  = false,
         updated_at = now()
  WHERE  id = p_change_order_id;

  -- Recalculate proposal totals if helper function exists
  IF v_proposal_id IS NOT NULL THEN
    BEGIN
      PERFORM calculate_proposal_totals(v_proposal_id);
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  END IF;

END;
$$;

GRANT EXECUTE ON FUNCTION apply_change_order(uuid) TO authenticated;
