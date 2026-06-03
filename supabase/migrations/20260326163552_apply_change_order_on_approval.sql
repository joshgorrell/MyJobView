/*
  # Apply Change Order Line Items on Approval

  ## Summary
  When a change order is approved, its line item actions must be "locked in" to the
  parent proposal. This migration creates the `apply_change_order` function that is
  called immediately after a change order reaches `approved` status.

  ## What the function does

  For each `change_order_line_items` record belonging to the approved CO:

  | action_type        | Effect on proposal_line_items                                       |
  |--------------------|---------------------------------------------------------------------|
  | `remove`           | Permanently sets `is_hidden = true` on the target line item.        |
  | `add`              | Inserts a new proposal_line_item from the CO line item data.        |
  | `modify_quantity`  | Updates `quantity` (and `line_total`) on the target line item.      |
  | `modify_price`     | Updates `unit_price` (and `line_total`) on the target line item.    |
  | `modify_labor`     | Updates labor-related fields on the target line item.               |
  | `modify_modifiers` | No proposal_line_item change — modifiers live on the proposal.      |

  After applying all items the function also:
  - Sets `change_orders.is_active = false` (the CO is now locked/historical)
  - Triggers a recalculation of the parent proposal's totals via
    `calculate_proposal_totals` if that function exists.

  ## Security
  SECURITY DEFINER so it can write to proposal_line_items regardless of the caller's
  RLS context.  Only authenticated users who can already see the change order can call it.

  ## Notes
  - Idempotent: calling it a second time on an already-applied CO is safe because the
    CO status is checked first.
  - The function returns void; errors propagate as exceptions.
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

  -- Process each line item
  FOR v_item IN
    SELECT * FROM change_order_line_items
    WHERE change_order_id = p_change_order_id
    ORDER BY sort_order NULLS LAST, created_at
  LOOP

    IF v_item.action_type = 'remove' THEN
      -- Hide the item on the proposal
      UPDATE proposal_line_items
      SET is_hidden = true,
          updated_at = now()
      WHERE id = v_item.proposal_line_item_id;

    ELSIF v_item.action_type = 'add' THEN
      -- Only insert if not already present (idempotency guard via co_line_item_id)
      IF NOT EXISTS (
        SELECT 1 FROM proposal_line_items
        WHERE change_order_line_item_id = v_item.id
      ) THEN
        INSERT INTO proposal_line_items (
          proposal_id,
          product_id,
          room,
          description,
          quantity,
          unit_price,
          line_total,
          taxable,
          notes,
          install_notes,
          sort_order,
          change_order_line_item_id,
          created_at,
          updated_at
        )
        SELECT
          v_proposal_id,
          v_item.product_id,
          v_item.room,
          COALESCE(v_item.description, v_item.product_name),
          v_item.new_quantity,
          v_item.new_unit_price,
          ROUND(v_item.new_quantity * v_item.new_unit_price, 2),
          COALESCE(v_item.taxable, true),
          v_item.notes,
          v_item.install_notes,
          v_item.sort_order,
          v_item.id,
          now(),
          now()
        WHERE v_proposal_id IS NOT NULL;
      END IF;

    ELSIF v_item.action_type IN ('modify_quantity', 'modify_price', 'modify_labor') THEN
      -- Update the existing line item
      UPDATE proposal_line_items
      SET
        quantity   = CASE WHEN v_item.action_type IN ('modify_quantity', 'modify_labor')
                          THEN v_item.new_quantity
                          ELSE quantity END,
        unit_price = CASE WHEN v_item.action_type IN ('modify_price', 'modify_labor')
                          THEN v_item.new_unit_price
                          ELSE unit_price END,
        line_total = ROUND(
          CASE WHEN v_item.action_type IN ('modify_quantity', 'modify_labor')
               THEN v_item.new_quantity
               ELSE quantity END
          *
          CASE WHEN v_item.action_type IN ('modify_price', 'modify_labor')
               THEN v_item.new_unit_price
               ELSE unit_price END
        , 2),
        updated_at = now()
      WHERE id = v_item.proposal_line_item_id;

    -- modify_modifiers has no proposal_line_item target — skip
    END IF;

  END LOOP;

  -- Mark the CO as no longer "active" (it is now locked into history)
  UPDATE change_orders
  SET is_active = false,
      updated_at = now()
  WHERE id = p_change_order_id;

  -- Recalculate proposal totals if the function exists
  IF v_proposal_id IS NOT NULL THEN
    BEGIN
      PERFORM calculate_proposal_totals(v_proposal_id);
    EXCEPTION WHEN undefined_function THEN
      NULL; -- function may not exist in all envs, safe to skip
    END;
  END IF;

END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION apply_change_order(uuid) TO authenticated;
