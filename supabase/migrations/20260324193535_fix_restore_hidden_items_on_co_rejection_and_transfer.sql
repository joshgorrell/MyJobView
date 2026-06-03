/*
  # Fix: Restore is_hidden on Proposal Line Items When Change Order is Rejected or Transferred

  ## Problem
  When a change order removes a line item (sets proposal_line_items.is_hidden = true and
  creates a change_order_line_items record with action_type = 'remove'), and that change
  order is later rejected or transferred to a new proposal, the original proposal line item
  stays permanently hidden. The REMOVED badge keeps appearing even though the CO is no
  longer active.

  ## Fix
  1. Update the `transfer_change_order_to_proposal` function to restore is_hidden = false
     on all proposal line items that were removed in the change order before marking the
     CO as transferred.

  2. Create a new `reject_change_order` function that handles rejection and also restores
     hidden line items. The frontend will call this instead of directly updating the CO status.

  ## Security
  Both functions use SECURITY DEFINER to allow writing to proposal_line_items.
*/

-- ============================================================================
-- 1. Update transfer function to restore hidden items
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

  SELECT so.contact_id, so.company_id
    INTO v_so
    FROM sales_orders so
   WHERE so.id = v_co.sales_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales order for change order % not found', p_change_order_id;
  END IF;

  v_company_id := v_so.company_id;
  v_title      := COALESCE(NULLIF(TRIM(p_proposal_title), ''), v_co.title);

  -- Restore hidden proposal line items that were removed in this CO
  UPDATE proposal_line_items pli
     SET is_hidden = false
   WHERE pli.id IN (
     SELECT coli.proposal_line_item_id
       FROM change_order_line_items coli
      WHERE coli.change_order_id = p_change_order_id
        AND coli.action_type = 'remove'
        AND coli.proposal_line_item_id IS NOT NULL
   );

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

  FOR v_location IN
    SELECT DISTINCT COALESCE(NULLIF(TRIM(install_location), ''), 'Unassigned') AS loc
      FROM change_order_line_items
     WHERE change_order_id = p_change_order_id
     ORDER BY loc
  LOOP
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

  UPDATE change_orders
     SET status                     = 'transferred',
         transferred_to_proposal_id = v_proposal_id,
         is_active                  = false,
         updated_at                 = now()
   WHERE id = p_change_order_id;

  RETURN v_proposal_id;
END;
$$;

-- ============================================================================
-- 2. Create reject_change_order function that also restores hidden items
-- ============================================================================
CREATE OR REPLACE FUNCTION reject_change_order(
  p_change_order_id  uuid,
  p_rejection_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Restore hidden proposal line items that were removed in this CO
  UPDATE proposal_line_items pli
     SET is_hidden = false
   WHERE pli.id IN (
     SELECT coli.proposal_line_item_id
       FROM change_order_line_items coli
      WHERE coli.change_order_id = p_change_order_id
        AND coli.action_type = 'remove'
        AND coli.proposal_line_item_id IS NOT NULL
   );

  -- Mark the change order as rejected
  UPDATE change_orders
     SET status           = 'rejected',
         rejection_reason = p_rejection_reason,
         is_active        = false,
         updated_at       = now()
   WHERE id = p_change_order_id;
END;
$$;
