/*
  # Transfer Change Order to Proposal

  ## Overview
  Adds support for transferring an unapproved change order into a brand-new standalone
  proposal. The change order is marked as "transferred" and a reference to the new
  proposal is stored for traceability.

  ## Changes

  ### Modified Tables

  #### `change_orders`
  - New `transferred` status added to the `status` check constraint
  - New `transferred_to_proposal_id` column (nullable FK to proposals) — records which
    proposal was created from this change order

  ### New Database Function

  #### `transfer_change_order_to_proposal(p_change_order_id uuid)`
  Atomically:
  1. Reads the change order and its parent sales order's contact_id
  2. Creates a new proposal in `draft` status with matching title, contact, and tax settings
  3. Groups change_order_line_items by install_location — each unique location becomes a
     proposal_room; items with no location land in an "Unassigned" room
  4. Inserts proposal_line_items mapped from every change order line item
  5. Updates the change order to status = 'transferred' and sets transferred_to_proposal_id

  Returns the new proposal's id as a uuid.

  ## Security
  - Function runs with SECURITY DEFINER so it can write to proposals / proposal_rooms /
    proposal_line_items regardless of the caller's RLS context
  - search_path is explicitly pinned to public
*/

-- ============================================================================
-- 1. Add 'transferred' to the change_orders status constraint
-- ============================================================================
DO $$
BEGIN
  -- Drop the old constraint if it exists (it may have different names across envs)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'change_orders'
      AND constraint_type = 'CHECK'
      AND constraint_name LIKE '%status%'
  ) THEN
    ALTER TABLE change_orders DROP CONSTRAINT IF EXISTS change_orders_status_check;
  END IF;

  -- Re-add with the extra value
  ALTER TABLE change_orders
    ADD CONSTRAINT change_orders_status_check
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'completed', 'transferred'));
EXCEPTION
  WHEN others THEN
    NULL; -- If constraint already includes 'transferred', skip silently
END $$;

-- ============================================================================
-- 2. Add transferred_to_proposal_id column
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_orders'
      AND column_name = 'transferred_to_proposal_id'
  ) THEN
    ALTER TABLE change_orders
      ADD COLUMN transferred_to_proposal_id uuid REFERENCES proposals(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- 3. Create the transfer function
-- ============================================================================
CREATE OR REPLACE FUNCTION transfer_change_order_to_proposal(
  p_change_order_id uuid,
  p_proposal_title  text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_co              record;
  v_so              record;
  v_company_id      uuid;
  v_proposal_id     uuid;
  v_room_id         uuid;
  v_location        text;
  v_title           text;
  v_sort            int := 0;
  v_item            record;
BEGIN
  -- ------------------------------------------------------------------
  -- Load the change order
  -- ------------------------------------------------------------------
  SELECT *
    INTO v_co
    FROM change_orders
   WHERE id = p_change_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Change order % not found', p_change_order_id;
  END IF;

  IF v_co.status NOT IN ('draft', 'pending_approval') THEN
    RAISE EXCEPTION 'Only draft or pending_approval change orders can be transferred (current status: %)', v_co.status;
  END IF;

  -- ------------------------------------------------------------------
  -- Load parent sales order to get contact_id and company_id
  -- ------------------------------------------------------------------
  SELECT so.contact_id, so.company_id
    INTO v_so
    FROM sales_orders so
   WHERE so.id = v_co.sales_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales order for change order % not found', p_change_order_id;
  END IF;

  v_company_id := v_so.company_id;
  v_title      := COALESCE(NULLIF(TRIM(p_proposal_title), ''), v_co.title);

  -- ------------------------------------------------------------------
  -- Create the new proposal
  -- ------------------------------------------------------------------
  INSERT INTO proposals (
    company_id,
    organization_id,
    contact_id,
    title,
    status,
    tax_rate,
    tax_environment,
    tax_project_type,
    created_by,
    is_revision,
    is_active_revision,
    is_portal_visible,
    revision_number
  )
  VALUES (
    v_company_id,
    v_co.organization_id,
    v_so.contact_id,
    v_title,
    'draft',
    COALESCE(v_co.tax_rate, 0),
    v_co.tax_environment,
    v_co.tax_project_type,
    auth.uid(),
    false,
    true,
    false,
    0
  )
  RETURNING id INTO v_proposal_id;

  -- ------------------------------------------------------------------
  -- For each distinct install_location, create a proposal_room, then
  -- insert the matching line items into that room.
  -- ------------------------------------------------------------------
  FOR v_location IN
    SELECT DISTINCT COALESCE(NULLIF(TRIM(install_location), ''), 'Unassigned') AS loc
      FROM change_order_line_items
     WHERE change_order_id = p_change_order_id
     ORDER BY loc
  LOOP
    -- Create the room
    INSERT INTO proposal_rooms (
      proposal_id,
      organization_id,
      name,
      sort_order
    )
    VALUES (
      v_proposal_id,
      v_co.organization_id,
      v_location,
      v_sort
    )
    RETURNING id INTO v_room_id;

    v_sort := v_sort + 1;

    -- Insert line items that belong to this room
    FOR v_item IN
      SELECT *
        FROM change_order_line_items
       WHERE change_order_id = p_change_order_id
         AND COALESCE(NULLIF(TRIM(install_location), ''), 'Unassigned') = v_location
       ORDER BY sort_order NULLS LAST
    LOOP
      INSERT INTO proposal_line_items (
        proposal_id,
        room_id,
        organization_id,
        product_id,
        description,
        quantity,
        unit_price,
        line_total,
        labor_phase_id,
        labor_phase_name,
        tech_notes,
        sort_order
      )
      VALUES (
        v_proposal_id,
        v_room_id,
        v_co.organization_id,
        v_item.product_id,
        COALESCE(v_item.product_description, v_item.product_name, ''),
        COALESCE(v_item.new_quantity, 0),
        COALESCE(v_item.new_unit_price, 0),
        COALESCE(v_item.new_total, 0),
        v_item.labor_phase_id,
        v_item.labor_phase_name,
        v_item.tech_notes,
        v_item.sort_order
      );
    END LOOP;
  END LOOP;

  -- ------------------------------------------------------------------
  -- Mark the change order as transferred
  -- ------------------------------------------------------------------
  UPDATE change_orders
     SET status                    = 'transferred',
         transferred_to_proposal_id = v_proposal_id,
         is_active                  = false,
         updated_at                 = now()
   WHERE id = p_change_order_id;

  RETURN v_proposal_id;
END;
$$;
