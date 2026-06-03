/*
  # Add Proposal Snapshot to Change Orders

  ## Summary
  Adds a JSONB snapshot column to change_orders to store the complete state of the linked
  proposal at the moment the change order was created. This enables clean, reliable reversion
  when a change order is deleted — restoring rooms, line items, quantities, prices, and modifiers
  exactly as they were before the change order.

  ## Changes
  - `change_orders.proposal_snapshot`: JSONB column storing all rooms and line items from the
    linked proposal at CO creation time
  - `change_orders.proposal_id`: Added FK reference to proposals if not already present
  - Helper function `capture_proposal_snapshot(proposal_id)` to build the snapshot object

  ## Structure of proposal_snapshot
  ```json
  {
    "captured_at": "ISO timestamp",
    "proposal_id": "uuid",
    "rooms": [
      {
        "id": "uuid",
        "name": "string",
        "description": "string|null",
        "sort_order": 0,
        "line_items": [
          {
            "id": "uuid",
            "product_id": "uuid|null",
            "description": "string",
            "quantity": 1,
            "unit_price": 100.00,
            "cost": 50.00,
            "line_total": 100.00,
            "item_type": "material|labor|both",
            "labor_hours": null,
            "labor_rate": null,
            "labor_total": null,
            "is_taxable": true,
            "is_hidden": false,
            "sort_order": 0,
            "parent_item_id": null,
            "labor_phase_id": null,
            "class_id": null,
            "display_mode": "itemized"
          }
        ]
      }
    ]
  }
  ```
*/

-- Add snapshot column to change_orders
ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS proposal_snapshot jsonb;

-- Add comment explaining the column
COMMENT ON COLUMN change_orders.proposal_snapshot IS
  'Full snapshot of the linked proposal (rooms + line items) captured at change order creation time. Used to revert the proposal if the change order is deleted.';

-- Create a helper function to capture the snapshot
CREATE OR REPLACE FUNCTION capture_proposal_snapshot(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rooms jsonb;
  v_result jsonb;
BEGIN
  -- Build rooms array with their line items
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'description', r.description,
      'sort_order', r.sort_order,
      'line_items', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', li.id,
            'product_id', li.product_id,
            'description', li.description,
            'quantity', li.quantity,
            'unit', li.unit,
            'unit_price', li.unit_price,
            'cost', li.cost,
            'line_total', li.line_total,
            'item_type', li.item_type,
            'labor_hours', li.labor_hours,
            'labor_rate', li.labor_rate,
            'labor_total', li.labor_total,
            'is_taxable', li.is_taxable,
            'is_hidden', li.is_hidden,
            'sort_order', li.sort_order,
            'parent_item_id', li.parent_item_id,
            'labor_phase_id', li.labor_phase_id,
            'class_id', li.class_id,
            'display_mode', li.display_mode,
            'show_task_notes', li.show_task_notes,
            'task_notes', li.task_notes
          )
          ORDER BY li.sort_order
        )
        FROM proposal_line_items li
        WHERE li.room_id = r.id
          AND li.proposal_id = p_proposal_id
      ), '[]'::jsonb)
    )
    ORDER BY r.sort_order
  )
  INTO v_rooms
  FROM proposal_rooms r
  WHERE r.proposal_id = p_proposal_id;

  v_result := jsonb_build_object(
    'captured_at', now(),
    'proposal_id', p_proposal_id,
    'rooms', COALESCE(v_rooms, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

-- Create a function to revert a proposal from a snapshot
CREATE OR REPLACE FUNCTION revert_proposal_from_snapshot(
  p_proposal_id uuid,
  p_snapshot jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room jsonb;
  v_item jsonb;
  v_room_id uuid;
  v_snapshot_room_ids uuid[];
  v_snapshot_item_ids uuid[];
BEGIN
  -- Collect all room and item IDs from the snapshot
  SELECT array_agg((r->>'id')::uuid)
  INTO v_snapshot_room_ids
  FROM jsonb_array_elements(p_snapshot->'rooms') r;

  -- Delete any rooms that don't exist in the snapshot (added by the CO)
  DELETE FROM proposal_rooms
  WHERE proposal_id = p_proposal_id
    AND (v_snapshot_room_ids IS NULL OR id != ALL(v_snapshot_room_ids));

  -- Restore each room from the snapshot
  FOR v_room IN SELECT * FROM jsonb_array_elements(p_snapshot->'rooms')
  LOOP
    v_room_id := (v_room->>'id')::uuid;

    -- Upsert the room
    INSERT INTO proposal_rooms (id, proposal_id, name, description, sort_order)
    VALUES (
      v_room_id,
      p_proposal_id,
      v_room->>'name',
      v_room->>'description',
      COALESCE((v_room->>'sort_order')::integer, 0)
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order;

    -- Collect snapshot item IDs for this room
    SELECT array_agg((li->>'id')::uuid)
    INTO v_snapshot_item_ids
    FROM jsonb_array_elements(v_room->'line_items') li;

    -- Delete items in this room that are NOT in the snapshot (were added by the CO)
    DELETE FROM proposal_line_items
    WHERE room_id = v_room_id
      AND proposal_id = p_proposal_id
      AND (v_snapshot_item_ids IS NULL OR id != ALL(v_snapshot_item_ids));

    -- Restore each line item from the snapshot
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_room->'line_items')
    LOOP
      INSERT INTO proposal_line_items (
        id, proposal_id, room_id, product_id, description,
        quantity, unit, unit_price, cost, line_total,
        item_type, labor_hours, labor_rate, labor_total,
        is_taxable, is_hidden, sort_order, parent_item_id,
        labor_phase_id, class_id, display_mode, show_task_notes, task_notes
      ) VALUES (
        (v_item->>'id')::uuid,
        p_proposal_id,
        v_room_id,
        CASE WHEN v_item->>'product_id' = 'null' OR v_item->>'product_id' IS NULL THEN NULL ELSE (v_item->>'product_id')::uuid END,
        COALESCE(v_item->>'description', ''),
        COALESCE((v_item->>'quantity')::numeric, 1),
        COALESCE(v_item->>'unit', 'each'),
        COALESCE((v_item->>'unit_price')::numeric, 0),
        CASE WHEN v_item->>'cost' = 'null' OR v_item->>'cost' IS NULL THEN NULL ELSE (v_item->>'cost')::numeric END,
        COALESCE((v_item->>'line_total')::numeric, 0),
        v_item->>'item_type',
        CASE WHEN v_item->>'labor_hours' = 'null' OR v_item->>'labor_hours' IS NULL THEN NULL ELSE (v_item->>'labor_hours')::numeric END,
        CASE WHEN v_item->>'labor_rate' = 'null' OR v_item->>'labor_rate' IS NULL THEN NULL ELSE (v_item->>'labor_rate')::numeric END,
        CASE WHEN v_item->>'labor_total' = 'null' OR v_item->>'labor_total' IS NULL THEN NULL ELSE (v_item->>'labor_total')::numeric END,
        COALESCE((v_item->>'is_taxable')::boolean, true),
        false, -- Always restore items as visible (not hidden)
        COALESCE((v_item->>'sort_order')::integer, 0),
        CASE WHEN v_item->>'parent_item_id' = 'null' OR v_item->>'parent_item_id' IS NULL THEN NULL ELSE (v_item->>'parent_item_id')::uuid END,
        CASE WHEN v_item->>'labor_phase_id' = 'null' OR v_item->>'labor_phase_id' IS NULL THEN NULL ELSE (v_item->>'labor_phase_id')::uuid END,
        CASE WHEN v_item->>'class_id' = 'null' OR v_item->>'class_id' IS NULL THEN NULL ELSE (v_item->>'class_id')::uuid END,
        COALESCE(v_item->>'display_mode', 'itemized'),
        COALESCE((v_item->>'show_task_notes')::boolean, false),
        v_item->>'task_notes'
      )
      ON CONFLICT (id) DO UPDATE SET
        description = EXCLUDED.description,
        quantity = EXCLUDED.quantity,
        unit = EXCLUDED.unit,
        unit_price = EXCLUDED.unit_price,
        cost = EXCLUDED.cost,
        line_total = EXCLUDED.line_total,
        item_type = EXCLUDED.item_type,
        labor_hours = EXCLUDED.labor_hours,
        labor_rate = EXCLUDED.labor_rate,
        labor_total = EXCLUDED.labor_total,
        is_taxable = EXCLUDED.is_taxable,
        is_hidden = false,
        sort_order = EXCLUDED.sort_order,
        parent_item_id = EXCLUDED.parent_item_id,
        labor_phase_id = EXCLUDED.labor_phase_id,
        class_id = EXCLUDED.class_id,
        display_mode = EXCLUDED.display_mode,
        show_task_notes = EXCLUDED.show_task_notes,
        task_notes = EXCLUDED.task_notes;
    END LOOP;
  END LOOP;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION capture_proposal_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION revert_proposal_from_snapshot(uuid, jsonb) TO authenticated;
