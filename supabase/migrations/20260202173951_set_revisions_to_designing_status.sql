/*
  # Set Revisions to Start at Designing Status

  1. Purpose
    - Ensure all new revisions start with 'designing' status
    - Revisions are always being reworked, so they should start at the beginning of the workflow

  2. Changes
    - Update create_proposal_revision function to set status to 'designing'
    - This ensures consistent workflow regardless of parent proposal status
*/

CREATE OR REPLACE FUNCTION create_proposal_revision(
  p_proposal_id uuid,
  p_revision_name text,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid AS $$
DECLARE
  v_new_proposal_id uuid;
  v_root_proposal_id uuid;
  v_root_proposal_number text;
  v_next_revision_number integer;
  v_new_proposal_number text;
  v_room_mapping jsonb := '{}'::jsonb;
  v_old_room record;
  v_new_room_id uuid;
  v_line_item record;
BEGIN
  -- Get root proposal (in case p_proposal_id is itself a revision)
  v_root_proposal_id := get_root_proposal_id(p_proposal_id);

  -- Get the root proposal number (without any revision suffix)
  SELECT
    CASE
      WHEN proposal_number ~ '-[0-9]+$' AND is_revision = true
      THEN regexp_replace(proposal_number, '-[0-9]+$', '')
      ELSE proposal_number
    END
  INTO v_root_proposal_number
  FROM proposals
  WHERE id = v_root_proposal_id;

  -- Get next revision number
  SELECT COALESCE(MAX(revision_number), 0) + 1
  INTO v_next_revision_number
  FROM proposals
  WHERE (id = v_root_proposal_id OR parent_proposal_id = v_root_proposal_id);

  -- Construct new proposal number: [original]-[revision_number]
  v_new_proposal_number := v_root_proposal_number || '-' || v_next_revision_number::text;

  -- Set all other revisions to inactive (only one can be active)
  UPDATE proposals
  SET is_active_revision = false
  WHERE (id = v_root_proposal_id OR parent_proposal_id = v_root_proposal_id);

  -- Create new proposal as revision
  -- IMPORTANT: Always set status to 'designing' for new revisions
  INSERT INTO proposals (
    company_id,
    contact_id,
    lead_id,
    proposal_number,
    title,
    status,
    valid_until,
    notes,
    customer_notes,
    subtotal,
    tax_rate,
    tax_amount,
    total,
    deposit_percent,
    deposit_amount,
    created_by,
    is_revision,
    parent_proposal_id,
    revision_name,
    is_active_revision,
    is_portal_visible,
    revision_number
  )
  SELECT
    company_id,
    contact_id,
    lead_id,
    v_new_proposal_number,
    title,
    'designing', -- Always start revisions at 'designing' status
    valid_until,
    notes,
    customer_notes,
    subtotal,
    tax_rate,
    tax_amount,
    total,
    deposit_percent,
    deposit_amount,
    p_created_by,
    true,
    v_root_proposal_id,
    p_revision_name,
    true,
    false,
    v_next_revision_number
  FROM proposals
  WHERE id = p_proposal_id
  RETURNING id INTO v_new_proposal_id;

  -- Copy rooms and track ID mapping
  FOR v_old_room IN
    SELECT * FROM proposal_rooms WHERE proposal_id = p_proposal_id ORDER BY sort_order
  LOOP
    INSERT INTO proposal_rooms (proposal_id, name, description, sort_order)
    VALUES (v_new_proposal_id, v_old_room.name, v_old_room.description, v_old_room.sort_order)
    RETURNING id INTO v_new_room_id;

    -- Track room ID mapping
    v_room_mapping := jsonb_set(v_room_mapping, ARRAY[v_old_room.id::text], to_jsonb(v_new_room_id));
  END LOOP;

  -- Copy line items using room mapping
  FOR v_line_item IN
    SELECT * FROM proposal_line_items WHERE proposal_id = p_proposal_id ORDER BY sort_order
  LOOP
    INSERT INTO proposal_line_items (
      proposal_id,
      room_id,
      product_id,
      description,
      quantity,
      unit,
      unit_price,
      cost,
      line_total,
      sort_order,
      is_custom,
      labor_hours,
      labor_rate,
      labor_total,
      item_type,
      is_taxable,
      tax_amount,
      item_class,
      labor_phase,
      task_notes,
      is_hidden,
      show_task_notes,
      labor_phase_id,
      class_id
    )
    VALUES (
      v_new_proposal_id,
      (v_room_mapping->>v_line_item.room_id::text)::uuid,
      v_line_item.product_id,
      v_line_item.description,
      v_line_item.quantity,
      v_line_item.unit,
      v_line_item.unit_price,
      v_line_item.cost,
      v_line_item.line_total,
      v_line_item.sort_order,
      v_line_item.is_custom,
      v_line_item.labor_hours,
      v_line_item.labor_rate,
      v_line_item.labor_total,
      v_line_item.item_type,
      v_line_item.is_taxable,
      v_line_item.tax_amount,
      v_line_item.item_class,
      v_line_item.labor_phase,
      v_line_item.task_notes,
      v_line_item.is_hidden,
      v_line_item.show_task_notes,
      v_line_item.labor_phase_id,
      v_line_item.class_id
    );
  END LOOP;

  -- Copy ALL proposal settings
  INSERT INTO proposal_settings (
    proposal_id,
    contract_id,
    payment_terms_type,
    deposit_percent,
    deposit_amount,
    deposit_type,
    payment_schedule,
    project_management_percent,
    project_design_percent,
    system_design_percent,
    credit_card_fee_percent,
    misc_parts_percent,
    discount_percent,
    custom_modifier_1_label,
    custom_modifier_1_percent,
    custom_modifier_2_label,
    custom_modifier_2_percent,
    selected_areas,
    acceptance_methods,
    require_deposit,
    scope_of_work,
    show_scope_in_pdf,
    show_contract_in_pdf,
    show_deposit_in_pdf,
    show_classes_in_builder,
    show_classes_in_pdf,
    class_display_mode,
    show_class_summary_page
  )
  SELECT
    v_new_proposal_id,
    contract_id,
    payment_terms_type,
    deposit_percent,
    deposit_amount,
    deposit_type,
    payment_schedule,
    project_management_percent,
    project_design_percent,
    system_design_percent,
    credit_card_fee_percent,
    misc_parts_percent,
    discount_percent,
    custom_modifier_1_label,
    custom_modifier_1_percent,
    custom_modifier_2_label,
    custom_modifier_2_percent,
    selected_areas,
    acceptance_methods,
    require_deposit,
    scope_of_work,
    show_scope_in_pdf,
    show_contract_in_pdf,
    show_deposit_in_pdf,
    show_classes_in_builder,
    show_classes_in_pdf,
    class_display_mode,
    show_class_summary_page
  FROM proposal_settings
  WHERE proposal_id = p_proposal_id;

  RETURN v_new_proposal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;