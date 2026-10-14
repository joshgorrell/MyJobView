/*\n  # Fix Proposal Settings Copy in Revision Function\n  \n  1. Changes\n    - Update create_proposal_revision to copy actual proposal_settings columns\n    - Remove references to non-existent columns (logo_url, header_color, etc.)\n*/\n\nCREATE OR REPLACE FUNCTION create_proposal_revision(\n  p_proposal_id uuid,\n  p_revision_name text,\n  p_created_by uuid DEFAULT auth.uid()\n)\nRETURNS uuid AS $$\nDECLARE\n  v_new_proposal_id uuid

\n  v_root_proposal_id uuid

\n  v_root_proposal_number text

\n  v_next_revision_number integer

\n  v_new_proposal_number text

\n  v_room_mapping jsonb := '{}'::jsonb

\n  v_old_room record

\n  v_new_room_id uuid

\n  v_line_item record

\nBEGIN\n  -- Get root proposal (in case p_proposal_id is itself a revision)\n  v_root_proposal_id := get_root_proposal_id(p_proposal_id)

\n\n  -- Get the root proposal number (without any revision suffix)\n  SELECT \n    CASE \n      WHEN proposal_number ~ '-[0-9]+$' AND is_revision = true \n      THEN regexp_replace(proposal_number, '-[0-9]+$', '')\n      ELSE proposal_number\n    END\n  INTO v_root_proposal_number\n  FROM proposals\n  WHERE id = v_root_proposal_id

\n\n  -- Get next revision number\n  SELECT COALESCE(MAX(revision_number), 0) + 1\n  INTO v_next_revision_number\n  FROM proposals\n  WHERE (id = v_root_proposal_id OR parent_proposal_id = v_root_proposal_id)

\n\n  -- Construct new proposal number: [original]-[revision_number]\n  v_new_proposal_number := v_root_proposal_number || '-' || v_next_revision_number::text

\n\n  -- Set all other revisions to inactive (only one can be active)\n  UPDATE proposals\n  SET is_active_revision = false\n  WHERE (id = v_root_proposal_id OR parent_proposal_id = v_root_proposal_id)

\n\n  -- Create new proposal as revision\n  INSERT INTO proposals (\n    company_id,\n    contact_id,\n    lead_id,\n    proposal_number,\n    title,\n    status,\n    valid_until,\n    notes,\n    customer_notes,\n    subtotal,\n    tax_rate,\n    tax_amount,\n    total,\n    deposit_percent,\n    deposit_amount,\n    created_by,\n    is_revision,\n    parent_proposal_id,\n    revision_name,\n    is_active_revision,\n    is_portal_visible,\n    revision_number\n  )\n  SELECT\n    company_id,\n    contact_id,\n    lead_id,\n    v_new_proposal_number,\n    title,\n    status,\n    valid_until,\n    notes,\n    customer_notes,\n    subtotal,\n    tax_rate,\n    tax_amount,\n    total,\n    deposit_percent,\n    deposit_amount,\n    p_created_by,\n    true,\n    v_root_proposal_id,\n    p_revision_name,\n    true,\n    false,\n    v_next_revision_number\n  FROM proposals\n  WHERE id = p_proposal_id\n  RETURNING id INTO v_new_proposal_id

\n\n  -- Copy rooms and track ID mapping\n  FOR v_old_room IN\n    SELECT * FROM proposal_rooms WHERE proposal_id = p_proposal_id ORDER BY sort_order\n  LOOP\n    INSERT INTO proposal_rooms (proposal_id, name, description, sort_order)\n    VALUES (v_new_proposal_id, v_old_room.name, v_old_room.description, v_old_room.sort_order)\n    RETURNING id INTO v_new_room_id

\n\n    -- Track room ID mapping\n    v_room_mapping := jsonb_set(v_room_mapping, ARRAY[v_old_room.id::text], to_jsonb(v_new_room_id))

\n  END LOOP

\n\n  -- Copy line items using room mapping\n  FOR v_line_item IN\n    SELECT * FROM proposal_line_items WHERE proposal_id = p_proposal_id ORDER BY sort_order\n  LOOP\n    INSERT INTO proposal_line_items (\n      proposal_id,\n      room_id,\n      product_id,\n      description,\n      quantity,\n      unit,\n      unit_price,\n      cost,\n      line_total,\n      sort_order,\n      is_custom,\n      labor_hours,\n      labor_rate,\n      labor_total,\n      item_type,\n      is_taxable,\n      tax_amount,\n      item_class,\n      labor_phase,\n      task_notes,\n      is_hidden,\n      show_task_notes,\n      labor_phase_id,\n      class_id\n    )\n    VALUES (\n      v_new_proposal_id,\n      (v_room_mapping->>v_line_item.room_id::text)::uuid,\n      v_line_item.product_id,\n      v_line_item.description,\n      v_line_item.quantity,\n      v_line_item.unit,\n      v_line_item.unit_price,\n      v_line_item.cost,\n      v_line_item.line_total,\n      v_line_item.sort_order,\n      v_line_item.is_custom,\n      v_line_item.labor_hours,\n      v_line_item.labor_rate,\n      v_line_item.labor_total,\n      v_line_item.item_type,\n      v_line_item.is_taxable,\n      v_line_item.tax_amount,\n      v_line_item.item_class,\n      v_line_item.labor_phase,\n      v_line_item.task_notes,\n      v_line_item.is_hidden,\n      v_line_item.show_task_notes,\n      v_line_item.labor_phase_id,\n      v_line_item.class_id\n    )

\n  END LOOP

\n\n  -- Copy proposal settings if they exist\n  INSERT INTO proposal_settings (\n    proposal_id,\n    contract_id,\n    payment_terms_type,\n    deposit_percent,\n    deposit_amount,\n    payment_schedule,\n    project_management_percent,\n    system_design_percent,\n    credit_card_fee_percent,\n    misc_parts_percent,\n    selected_areas,\n    deposit_type,\n    acceptance_methods,\n    require_deposit,\n    scope_of_work,\n    discount_percent,\n    project_design_percent,\n    custom_modifier_1_label,\n    custom_modifier_1_percent,\n    custom_modifier_2_label,\n    custom_modifier_2_percent,\n    show_scope_in_pdf,\n    show_contract_in_pdf,\n    show_deposit_in_pdf,\n    show_classes_in_builder,\n    show_classes_in_pdf,\n    class_display_mode,\n    show_class_summary_page\n  )\n  SELECT\n    v_new_proposal_id,\n    contract_id,\n    payment_terms_type,\n    deposit_percent,\n    deposit_amount,\n    payment_schedule,\n    project_management_percent,\n    system_design_percent,\n    credit_card_fee_percent,\n    misc_parts_percent,\n    selected_areas,\n    deposit_type,\n    acceptance_methods,\n    require_deposit,\n    scope_of_work,\n    discount_percent,\n    project_design_percent,\n    custom_modifier_1_label,\n    custom_modifier_1_percent,\n    custom_modifier_2_label,\n    custom_modifier_2_percent,\n    show_scope_in_pdf,\n    show_contract_in_pdf,\n    show_deposit_in_pdf,\n    show_classes_in_builder,\n    show_classes_in_pdf,\n    class_display_mode,\n    show_class_summary_page\n  FROM proposal_settings\n  WHERE proposal_id = p_proposal_id

\n\n  RETURN v_new_proposal_id

\nEND

\n$$ LANGUAGE plpgsql SECURITY DEFINER

\n
