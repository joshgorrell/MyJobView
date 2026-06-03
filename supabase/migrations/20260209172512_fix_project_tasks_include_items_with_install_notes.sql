/*
  # Create Project Tasks for Items with Labor OR Install Notes

  1. Changes
    - Update trigger to create tasks for items with labor phases OR task_notes
    - Items with only install notes (no labor) will create simple tasks
    - Items with labor phases will create a task per phase (as before)

  2. Business Logic
    - Any proposal line item with labor phases → creates task per phase
    - Any proposal line item with task_notes but no labor → creates single task
    - This ensures all installation instructions are captured in project tasks
*/

-- Updated function to include items with install notes
CREATE OR REPLACE FUNCTION generate_project_tasks_from_proposal()
RETURNS TRIGGER AS $$
DECLARE
  v_project_id uuid;
  v_proposal_id uuid;
  v_task_sort_order integer := 0;
  v_line_item record;
  v_labor_phase record;
  v_task_description text;
  v_has_labor_phases boolean;
BEGIN
  -- Only process if this is a new sales order with a proposal
  IF NEW.proposal_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_proposal_id := NEW.proposal_id;

  -- Check if a project was created for this sales order
  SELECT id INTO v_project_id
  FROM projects
  WHERE sales_order_id = NEW.id
  LIMIT 1;

  -- If no project exists yet, we'll skip (project might be created later)
  IF v_project_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Iterate through proposal line items that have labor phases OR task_notes
  FOR v_line_item IN (
    SELECT DISTINCT
      pli.id as line_item_id,
      pli.product_name,
      pli.description,
      pli.task_notes,
      pr.name as room_name
    FROM proposal_line_items pli
    LEFT JOIN proposal_rooms pr ON pr.id = pli.room_id
    WHERE pli.proposal_id = v_proposal_id
    AND (
      EXISTS (
        SELECT 1 FROM proposal_line_item_labor_phases plilp
        WHERE plilp.line_item_id = pli.id
      )
      OR (pli.task_notes IS NOT NULL AND pli.task_notes != '')
    )
    ORDER BY pr.sort_order NULLS LAST, pli.sort_order
  )
  LOOP
    -- Check if this item has labor phases
    SELECT EXISTS (
      SELECT 1 FROM proposal_line_item_labor_phases
      WHERE line_item_id = v_line_item.line_item_id
    ) INTO v_has_labor_phases;

    IF v_has_labor_phases THEN
      -- Create a task for each labor phase
      FOR v_labor_phase IN (
        SELECT
          plilp.labor_phase_id,
          plilp.hours,
          plilp.tech_notes,
          plilp.sort_order as phase_sort_order,
          lp.name as phase_name
        FROM proposal_line_item_labor_phases plilp
        JOIN labor_phases lp ON lp.id = plilp.labor_phase_id
        WHERE plilp.line_item_id = v_line_item.line_item_id
        ORDER BY plilp.sort_order
      )
      LOOP
        -- Build task description with priority: tech_notes > task_notes > description
        v_task_description := NULL;

        IF v_labor_phase.tech_notes IS NOT NULL AND v_labor_phase.tech_notes != '' THEN
          v_task_description := v_labor_phase.tech_notes;
        ELSIF v_line_item.task_notes IS NOT NULL AND v_line_item.task_notes != '' THEN
          v_task_description := v_line_item.task_notes;
        ELSE
          v_task_description := v_line_item.description;
        END IF;

        -- Create project task
        INSERT INTO project_tasks (
          project_id,
          title,
          description,
          labor_phase_id,
          estimated_hours,
          status,
          sort_order,
          source_line_item_id,
          source_phase_id,
          created_by,
          created_at,
          updated_at
        ) VALUES (
          v_project_id,
          COALESCE(v_line_item.room_name || ' - ', '') || v_line_item.product_name || ' - ' || v_labor_phase.phase_name,
          v_task_description,
          v_labor_phase.labor_phase_id,
          v_labor_phase.hours,
          'open',
          v_task_sort_order,
          v_line_item.line_item_id,
          v_labor_phase.labor_phase_id,
          NEW.created_by,
          now(),
          now()
        );

        v_task_sort_order := v_task_sort_order + 1;
      END LOOP;
    ELSE
      -- No labor phases, but has task_notes - create single task
      v_task_description := COALESCE(v_line_item.task_notes, v_line_item.description);

      INSERT INTO project_tasks (
        project_id,
        title,
        description,
        labor_phase_id,
        estimated_hours,
        status,
        sort_order,
        source_line_item_id,
        created_by,
        created_at,
        updated_at
      ) VALUES (
        v_project_id,
        COALESCE(v_line_item.room_name || ' - ', '') || v_line_item.product_name,
        v_task_description,
        NULL,
        NULL,
        'open',
        v_task_sort_order,
        v_line_item.line_item_id,
        NEW.created_by,
        now(),
        now()
      );

      v_task_sort_order := v_task_sort_order + 1;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public';

-- Also update the function for when project is created after sales order
CREATE OR REPLACE FUNCTION generate_project_tasks_on_project_creation()
RETURNS TRIGGER AS $$
DECLARE
  v_proposal_id uuid;
  v_task_sort_order integer := 0;
  v_line_item record;
  v_labor_phase record;
  v_task_description text;
  v_has_labor_phases boolean;
BEGIN
  -- Only process if this project has a sales order with a proposal
  IF NEW.sales_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get the proposal_id from the sales order
  SELECT proposal_id INTO v_proposal_id
  FROM sales_orders
  WHERE id = NEW.sales_order_id;

  IF v_proposal_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if tasks already exist for this project (avoid duplicates)
  IF EXISTS (SELECT 1 FROM project_tasks WHERE project_id = NEW.id LIMIT 1) THEN
    RETURN NEW;
  END IF;

  -- Iterate through proposal line items that have labor phases OR task_notes
  FOR v_line_item IN (
    SELECT DISTINCT
      pli.id as line_item_id,
      pli.product_name,
      pli.description,
      pli.task_notes,
      pr.name as room_name
    FROM proposal_line_items pli
    LEFT JOIN proposal_rooms pr ON pr.id = pli.room_id
    WHERE pli.proposal_id = v_proposal_id
    AND (
      EXISTS (
        SELECT 1 FROM proposal_line_item_labor_phases plilp
        WHERE plilp.line_item_id = pli.id
      )
      OR (pli.task_notes IS NOT NULL AND pli.task_notes != '')
    )
    ORDER BY pr.sort_order NULLS LAST, pli.sort_order
  )
  LOOP
    -- Check if this item has labor phases
    SELECT EXISTS (
      SELECT 1 FROM proposal_line_item_labor_phases
      WHERE line_item_id = v_line_item.line_item_id
    ) INTO v_has_labor_phases;

    IF v_has_labor_phases THEN
      -- Create a task for each labor phase
      FOR v_labor_phase IN (
        SELECT
          plilp.labor_phase_id,
          plilp.hours,
          plilp.tech_notes,
          plilp.sort_order as phase_sort_order,
          lp.name as phase_name
        FROM proposal_line_item_labor_phases plilp
        JOIN labor_phases lp ON lp.id = plilp.labor_phase_id
        WHERE plilp.line_item_id = v_line_item.line_item_id
        ORDER BY plilp.sort_order
      )
      LOOP
        -- Build task description with priority: tech_notes > task_notes > description
        v_task_description := NULL;

        IF v_labor_phase.tech_notes IS NOT NULL AND v_labor_phase.tech_notes != '' THEN
          v_task_description := v_labor_phase.tech_notes;
        ELSIF v_line_item.task_notes IS NOT NULL AND v_line_item.task_notes != '' THEN
          v_task_description := v_line_item.task_notes;
        ELSE
          v_task_description := v_line_item.description;
        END IF;

        -- Create project task
        INSERT INTO project_tasks (
          project_id,
          title,
          description,
          labor_phase_id,
          estimated_hours,
          status,
          sort_order,
          source_line_item_id,
          source_phase_id,
          created_by,
          created_at,
          updated_at
        ) VALUES (
          NEW.id,
          COALESCE(v_line_item.room_name || ' - ', '') || v_line_item.product_name || ' - ' || v_labor_phase.phase_name,
          v_task_description,
          v_labor_phase.labor_phase_id,
          v_labor_phase.hours,
          'open',
          v_task_sort_order,
          v_line_item.line_item_id,
          v_labor_phase.labor_phase_id,
          NEW.created_by,
          now(),
          now()
        );

        v_task_sort_order := v_task_sort_order + 1;
      END LOOP;
    ELSE
      -- No labor phases, but has task_notes - create single task
      v_task_description := COALESCE(v_line_item.task_notes, v_line_item.description);

      INSERT INTO project_tasks (
        project_id,
        title,
        description,
        labor_phase_id,
        estimated_hours,
        status,
        sort_order,
        source_line_item_id,
        created_by,
        created_at,
        updated_at
      ) VALUES (
        NEW.id,
        COALESCE(v_line_item.room_name || ' - ', '') || v_line_item.product_name,
        v_task_description,
        NULL,
        NULL,
        'open',
        v_task_sort_order,
        v_line_item.line_item_id,
        NEW.created_by,
        now(),
        now()
      );

      v_task_sort_order := v_task_sort_order + 1;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public';