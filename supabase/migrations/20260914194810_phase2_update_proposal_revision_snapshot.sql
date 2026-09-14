/*
# Phase 2: Update create_proposal_revision for Task Snapshot Copying

## Purpose
Update create_proposal_revision() to:
1. Copy proposal_tasks from old proposal to new revision (snapshot)
2. Copy proposal_line_item_labor_phases (pre-existing gap -- was not copied before)
3. Copy missing line item columns added since the function was written
4. Track line item ID mapping for correct references in copied tasks and labor phases

## What Changed

### create_proposal_revision() now:
1. Builds a line_item_mapping jsonb (old ID -> new ID), same pattern as room mapping
2. Copies ALL line item columns including previously missing ones:
   - tasks_seeded_at (so revision does not re-seed)
   - programming_labor_hours, programming_notes, show_programming_notes
   - parent_item_id (mapped to new revision's parent items)
   - display_mode, is_customer_supplied, tax_classification_id
3. Copies proposal_line_item_labor_phases with mapped line_item_id
4. Copies proposal_tasks with mapped line_item_id, same source_default_task_id,
   title, description, labor_phase_id, sort_order
5. Does NOT re-read catalog defaults or call the seeding function

## Security
- Function is already SECURITY DEFINER
- No RLS changes

## Important Notes
1. The revision is a SNAPSHOT copy -- catalog default changes do not affect it
2. tasks_seeded_at is copied so the revision does not re-seed
3. Labor phases were not being copied before (pre-existing bug now fixed)
4. parent_item_id is mapped to the new revision's parent item IDs
*/

CREATE OR REPLACE FUNCTION create_proposal_revision(
  p_proposal_id uuid,
  p_revision_name text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_proposal_id    uuid;
  v_root_proposal_id   uuid;
  v_root_proposal_number text;
  v_next_revision_number integer;
  v_new_proposal_number text;
  v_room_mapping       jsonb := '{}'::jsonb;
  v_line_item_mapping  jsonb := '{}'::jsonb;
  v_old_room           record;
  v_new_room_id        uuid;
  v_line_item          record;
  v_new_line_item_id   uuid;
  v_old_labor_phase    record;
  v_old_task           record;
BEGIN
  v_root_proposal_id := get_root_proposal_id(p_proposal_id);

  SELECT
    CASE
      WHEN proposal_number ~ '-[0-9]+$' AND is_revision = true
      THEN regexp_replace(proposal_number, '-[0-9]+$', '')
      ELSE proposal_number
    END
  INTO v_root_proposal_number
  FROM proposals
  WHERE id = v_root_proposal_id;

  SELECT COALESCE(MAX(revision_number), 0) + 1
  INTO v_next_revision_number
  FROM proposals
  WHERE (id = v_root_proposal_id OR parent_proposal_id = v_root_proposal_id);

  v_new_proposal_number := v_root_proposal_number || '-' || v_next_revision_number::text;

  UPDATE proposals
  SET is_active_revision = false
  WHERE (id = v_root_proposal_id OR parent_proposal_id = v_root_proposal_id);

  INSERT INTO proposals (
    company_id, contact_id, lead_id, proposal_number, title, status,
    valid_until, notes, customer_notes, subtotal, tax_rate, tax_amount, total,
    deposit_percent, deposit_amount, created_by, is_revision, parent_proposal_id,
    revision_name, is_active_revision, is_portal_visible, revision_number
  )
  SELECT
    company_id, contact_id, lead_id, v_new_proposal_number, title, 'designing',
    valid_until, notes, customer_notes, subtotal, tax_rate, tax_amount, total,
    deposit_percent, deposit_amount, p_created_by, true, v_root_proposal_id,
    p_revision_name, true, false, v_next_revision_number
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

    v_room_mapping := jsonb_set(v_room_mapping, ARRAY[v_old_room.id::text], to_jsonb(v_new_room_id));
  END LOOP;

  -- Copy line items with ALL columns, track ID mapping
  FOR v_line_item IN
    SELECT * FROM proposal_line_items WHERE proposal_id = p_proposal_id ORDER BY sort_order
  LOOP
    INSERT INTO proposal_line_items (
      proposal_id, room_id, product_id, description, quantity, unit, unit_price,
      cost, line_total, sort_order, is_custom, created_at, updated_at,
      labor_hours, labor_rate, labor_total, item_type, is_taxable, tax_amount,
      item_class, labor_phase, task_notes, is_hidden, show_task_notes,
      labor_phase_id, class_id, parent_item_id, display_mode, organization_id,
      programming_labor_hours, programming_notes, show_programming_notes,
      task_completed, is_customer_supplied, tax_classification_id, tasks_seeded_at
    )
    VALUES (
      v_new_proposal_id,
      CASE WHEN v_line_item.room_id IS NOT NULL
        THEN (v_room_mapping->>v_line_item.room_id::text)::uuid
        ELSE NULL
      END,
      v_line_item.product_id,
      v_line_item.description,
      v_line_item.quantity,
      v_line_item.unit,
      v_line_item.unit_price,
      v_line_item.cost,
      v_line_item.line_total,
      v_line_item.sort_order,
      v_line_item.is_custom,
      v_line_item.created_at,
      v_line_item.updated_at,
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
      v_line_item.class_id,
      -- Map parent_item_id to new revision's parent item
      CASE WHEN v_line_item.parent_item_id IS NOT NULL
        THEN (v_line_item_mapping->>v_line_item.parent_item_id::text)::uuid
        ELSE NULL
      END,
      v_line_item.display_mode,
      v_line_item.organization_id,
      v_line_item.programming_labor_hours,
      v_line_item.programming_notes,
      v_line_item.show_programming_notes,
      v_line_item.task_completed,
      v_line_item.is_customer_supplied,
      v_line_item.tax_classification_id,
      v_line_item.tasks_seeded_at
    )
    RETURNING id INTO v_new_line_item_id;

    v_line_item_mapping := jsonb_set(v_line_item_mapping, ARRAY[v_line_item.id::text], to_jsonb(v_new_line_item_id));
  END LOOP;

  -- Copy labor phases with mapped line_item_id (pre-existing gap fixed)
  FOR v_old_labor_phase IN
    SELECT * FROM proposal_line_item_labor_phases
    WHERE line_item_id IN (SELECT id FROM proposal_line_items WHERE proposal_id = p_proposal_id)
    ORDER BY line_item_id, sort_order
  LOOP
    INSERT INTO proposal_line_item_labor_phases (
      line_item_id, labor_phase_id, hours, tech_notes, sort_order, organization_id
    )
    VALUES (
      (v_line_item_mapping->>v_old_labor_phase.line_item_id::text)::uuid,
      v_old_labor_phase.labor_phase_id,
      v_old_labor_phase.hours,
      v_old_labor_phase.tech_notes,
      v_old_labor_phase.sort_order,
      v_old_labor_phase.organization_id
    );
  END LOOP;

  -- Copy proposal_tasks with mapped line_item_id (snapshot, not regenerated)
  FOR v_old_task IN
    SELECT * FROM proposal_tasks
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    INSERT INTO proposal_tasks (
      proposal_id, line_item_id, source_default_task_id,
      title, description, labor_phase_id, sort_order,
      organization_id, created_by, created_at, updated_at
    )
    VALUES (
      v_new_proposal_id,
      CASE WHEN v_old_task.line_item_id IS NOT NULL
        THEN (v_line_item_mapping->>v_old_task.line_item_id::text)::uuid
        ELSE NULL
      END,
      v_old_task.source_default_task_id,
      v_old_task.title,
      v_old_task.description,
      v_old_task.labor_phase_id,
      v_old_task.sort_order,
      v_old_task.organization_id,
      v_old_task.created_by,
      v_old_task.created_at,
      v_old_task.updated_at
    );
  END LOOP;

  -- Copy proposal settings
  INSERT INTO proposal_settings (
    proposal_id, contract_id, payment_terms_type, deposit_percent, deposit_amount,
    deposit_type, payment_schedule, project_management_percent, project_design_percent,
    system_design_percent, credit_card_fee_percent, misc_parts_percent, discount_percent,
    custom_modifier_1_label, custom_modifier_1_percent, custom_modifier_2_label,
    custom_modifier_2_percent, selected_areas, acceptance_methods, require_deposit,
    scope_of_work, show_scope_in_pdf, show_contract_in_pdf, show_deposit_in_pdf,
    show_classes_in_builder, show_classes_in_pdf, class_display_mode, show_class_summary_page
  )
  SELECT
    v_new_proposal_id, contract_id, payment_terms_type, deposit_percent, deposit_amount,
    deposit_type, payment_schedule, project_management_percent, project_design_percent,
    system_design_percent, credit_card_fee_percent, misc_parts_percent, discount_percent,
    custom_modifier_1_label, custom_modifier_1_percent, custom_modifier_2_label,
    custom_modifier_2_percent, selected_areas, acceptance_methods, require_deposit,
    scope_of_work, show_scope_in_pdf, show_contract_in_pdf, show_deposit_in_pdf,
    show_classes_in_builder, show_classes_in_pdf, class_display_mode, show_class_summary_page
  FROM proposal_settings
  WHERE proposal_id = p_proposal_id;

  RETURN v_new_proposal_id;
END;
$$;
