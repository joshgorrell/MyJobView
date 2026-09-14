/*
# Phase 2: Centralized Proposal Task Seeding Function and Triggers

## Purpose
Create ONE authoritative database function that seeds proposal tasks for a line item,
plus trigger wrapper functions that call it when a line item is created or labor is added.

## What This Does

### 1. Function: seed_proposal_tasks_for_line_item(p_line_item_id uuid)
SECURITY DEFINER function implementing the complete seeding business rule:
1. Load line item, return if not found
2. If tasks_seeded_at IS NOT NULL, return (never re-seed)
3. Check catalog_item_default_tasks for the product
4. Check labor: labor_hours > 0 OR programming_labor_hours > 0 OR labor phases exist
5. If catalog defaults exist: copy them, mark seeded, return (no extra generic task)
6. Else if labor exists: create ONE fallback task from item description, mark seeded
7. Else: create nothing, leave tasks_seeded_at NULL

### 2. Trigger wrapper: trg_seed_tasks_on_line_item_insert
AFTER INSERT on proposal_line_items -> calls seed_proposal_tasks_for_line_item

### 3. Trigger wrapper: trg_seed_tasks_on_labor_phase_insert
AFTER INSERT on proposal_line_item_labor_phases -> calls seed_proposal_tasks_for_line_item

## Security
- Main function is SECURITY DEFINER (bypasses RLS in trigger context)
- Trigger wrappers are plain plpgsql trigger functions

## Important Notes
1. SINGLE authoritative implementation of the seeding business rule
2. tasks_seeded_at is authoritative: once set, never re-seed
3. Deleted tasks stay deleted
4. Accessory/child items follow the same rules
5. Idempotent
*/

-- Create the centralized seeding function
CREATE OR REPLACE FUNCTION seed_proposal_tasks_for_line_item(p_line_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line_item  record;
  v_default    record;
  v_sort_order integer := 0;
  v_has_labor  boolean := false;
BEGIN
  SELECT * INTO v_line_item
  FROM proposal_line_items
  WHERE id = p_line_item_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_line_item.tasks_seeded_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_line_item.product_id IS NOT NULL THEN
    FOR v_default IN
      SELECT id, title, description, labor_phase_id, sort_order
      FROM catalog_item_default_tasks
      WHERE product_id = v_line_item.product_id
      ORDER BY sort_order
    LOOP
      INSERT INTO proposal_tasks (
        proposal_id, line_item_id, source_default_task_id,
        title, description, labor_phase_id, sort_order,
        organization_id
      ) VALUES (
        v_line_item.proposal_id, p_line_item_id, v_default.id,
        v_default.title, v_default.description, v_default.labor_phase_id,
        v_default.sort_order, v_line_item.organization_id
      );
      v_sort_order := v_sort_order + 1;
    END LOOP;
  END IF;

  IF v_sort_order > 0 THEN
    UPDATE proposal_line_items
    SET tasks_seeded_at = now()
    WHERE id = p_line_item_id;
    RETURN;
  END IF;

  v_has_labor := false;

  IF v_line_item.labor_hours IS NOT NULL AND v_line_item.labor_hours > 0 THEN
    v_has_labor := true;
  ELSIF v_line_item.programming_labor_hours IS NOT NULL AND v_line_item.programming_labor_hours > 0 THEN
    v_has_labor := true;
  ELSIF EXISTS (
    SELECT 1 FROM proposal_line_item_labor_phases
    WHERE line_item_id = p_line_item_id
  ) THEN
    v_has_labor := true;
  END IF;

  IF v_has_labor THEN
    INSERT INTO proposal_tasks (
      proposal_id, line_item_id, source_default_task_id,
      title, description, labor_phase_id, sort_order,
      organization_id
    ) VALUES (
      v_line_item.proposal_id, p_line_item_id, NULL,
      v_line_item.description, NULL, NULL, 0,
      v_line_item.organization_id
    );

    UPDATE proposal_line_items
    SET tasks_seeded_at = now()
    WHERE id = p_line_item_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION seed_proposal_tasks_for_line_item(uuid) TO authenticated;

-- Trigger wrapper for proposal_line_items AFTER INSERT
CREATE OR REPLACE FUNCTION seed_tasks_on_line_item_insert_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM seed_proposal_tasks_for_line_item(NEW.id);
  RETURN NEW;
END;
$$;

-- Trigger wrapper for proposal_line_item_labor_phases AFTER INSERT
CREATE OR REPLACE FUNCTION seed_tasks_on_labor_phase_insert_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM seed_proposal_tasks_for_line_item(NEW.line_item_id);
  RETURN NEW;
END;
$$;

-- Trigger: seed tasks when a proposal line item is created
DROP TRIGGER IF EXISTS trg_seed_tasks_on_line_item_insert ON proposal_line_items;
CREATE TRIGGER trg_seed_tasks_on_line_item_insert
  AFTER INSERT ON proposal_line_items
  FOR EACH ROW
  EXECUTE FUNCTION seed_tasks_on_line_item_insert_trigger();

-- Trigger: seed tasks when a labor phase is added to a line item
DROP TRIGGER IF EXISTS trg_seed_tasks_on_labor_phase_insert ON proposal_line_item_labor_phases;
CREATE TRIGGER trg_seed_tasks_on_labor_phase_insert
  AFTER INSERT ON proposal_line_item_labor_phases
  FOR EACH ROW
  EXECUTE FUNCTION seed_tasks_on_labor_phase_insert_trigger();
