/*\n  # Enhance Punchlist Task Conversion System\n\n  ## Summary\n  Adds ability to convert punchlist tasks to either service requests or work orders,\n  with support for bulk conversion of multiple tasks into a single work order/service request.\n\n  ## Changes\n\n  1. Schema Updates\n    - Add work_order_id to punchlist_tasks table\n    - Add combined_description field for merged tasks\n    - Update status constraint to include 'scheduled' and 'in_work_order'\n\n  2. New Functions\n    - convert_punchlist_tasks_to_service_request() - Bulk create service request\n    - convert_punchlist_tasks_to_work_order() - Bulk create work order directly\n    - generate_combined_task_description() - Merge multiple task descriptions\n\n  3. Indexes\n    - Add index on work_order_id for performance\n\n  ## Notes\n  - Multiple tasks can be combined into one service request or work order\n  - Tasks maintain link to original via work_order_id or service_request_id\n  - Audit trail maintained in punchlist_task_history\n*/\n\n-- Add work_order_id to punchlist_tasks if not exists\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'punchlist_tasks' AND column_name = 'work_order_id'\n  ) THEN\n    ALTER TABLE punchlist_tasks ADD COLUMN work_order_id uuid REFERENCES work_orders(id) ON DELETE SET NULL

\n  END IF

\nEND $$

\n\n-- Add combined_description field for tracking merged tasks\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'punchlist_tasks' AND column_name = 'combined_description'\n  ) THEN\n    ALTER TABLE punchlist_tasks ADD COLUMN combined_description text

\n  END IF

\nEND $$

\n\n-- Update status constraint to include new statuses\nDO $$\nBEGIN\n  ALTER TABLE punchlist_tasks DROP CONSTRAINT IF EXISTS punchlist_tasks_status_check

\n  ALTER TABLE punchlist_tasks ADD CONSTRAINT punchlist_tasks_status_check\n    CHECK (status IN ('draft', 'pending', 'submitted', 'requested', 'scheduled', 'in_work_order', 'in_progress', 'completed', 'cancelled'))

\nEND $$

\n\n-- Create index on work_order_id\nCREATE INDEX IF NOT EXISTS idx_punchlist_tasks_work_order ON punchlist_tasks(work_order_id)

\n\n-- Function to generate combined description from multiple tasks\nCREATE OR REPLACE FUNCTION generate_combined_task_description(p_task_ids uuid[])\nRETURNS text\nLANGUAGE plpgsql\nSECURITY DEFINER\nAS $$\nDECLARE\n  combined_desc text := ''

\n  task_record record

\n  task_count int := 0

\nBEGIN\n  combined_desc := E'Combined Punchlist Tasks:\\n\\n'

\n\n  FOR task_record IN\n    SELECT title, details, created_at\n    FROM punchlist_tasks\n    WHERE id = ANY(p_task_ids)\n    ORDER BY created_at\n  LOOP\n    task_count := task_count + 1

\n    combined_desc := combined_desc || task_count || '. ' || task_record.title

\n\n    IF task_record.details IS NOT NULL AND task_record.details != '' THEN\n      combined_desc := combined_desc || E'\\n   ' || task_record.details

\n    END IF

\n\n    combined_desc := combined_desc || E'\\n\\n'

\n  END LOOP

\n\n  RETURN combined_desc

\nEND

\n$$

\n\n-- Function to convert punchlist tasks to service request (bulk)\nCREATE OR REPLACE FUNCTION convert_punchlist_tasks_to_service_request(\n  p_task_ids uuid[],\n  p_contact_id uuid,\n  p_priority text DEFAULT 'normal',\n  p_billable_type text DEFAULT 'billable',\n  p_billable_by text DEFAULT 'dispatch',\n  p_billable_by_user_id uuid DEFAULT NULL,\n  p_notes text DEFAULT NULL\n)\nRETURNS uuid\nLANGUAGE plpgsql\nSECURITY DEFINER\nAS $$\nDECLARE\n  v_service_request_id uuid

\n  v_combined_description text

\n  v_contact_record record

\n  v_task_id uuid

\nBEGIN\n  -- Validate we have at least one task\n  IF array_length(p_task_ids, 1) IS NULL OR array_length(p_task_ids, 1) = 0 THEN\n    RAISE EXCEPTION 'At least one task ID is required'

\n  END IF

\n\n  -- Validate all tasks belong to the same contact\n  IF EXISTS (\n    SELECT 1 FROM punchlist_tasks\n    WHERE id = ANY(p_task_ids)\n    AND contact_id != p_contact_id\n  ) THEN\n    RAISE EXCEPTION 'All tasks must belong to the same contact'

\n  END IF

\n\n  -- Validate tasks are not already converted\n  IF EXISTS (\n    SELECT 1 FROM punchlist_tasks\n    WHERE id = ANY(p_task_ids)\n    AND (service_request_id IS NOT NULL OR work_order_id IS NOT NULL)\n  ) THEN\n    RAISE EXCEPTION 'One or more tasks have already been converted'

\n  END IF

\n\n  -- Get contact information\n  SELECT\n    full_name,\n    phone,\n    email,\n    street_address,\n    city,\n    state,\n    zip_code\n  INTO v_contact_record\n  FROM contacts\n  WHERE id = p_contact_id

\n\n  IF NOT FOUND THEN\n    RAISE EXCEPTION 'Contact not found'

\n  END IF

\n\n  -- Generate combined description\n  v_combined_description := generate_combined_task_description(p_task_ids)

\n\n  -- Create service request\n  INSERT INTO service_requests (\n    created_by,\n    contact_id,\n    customer_name,\n    customer_phone,\n    customer_email,\n    job_location_address,\n    job_location_city,\n    job_location_state,\n    job_location_zip,\n    job_description,\n    billable_type,\n    billable_by,\n    billable_by_user_id,\n    priority,\n    notes,\n    status\n  ) VALUES (\n    auth.uid(),\n    p_contact_id,\n    v_contact_record.full_name,\n    v_contact_record.phone,\n    v_contact_record.email,\n    v_contact_record.street_address,\n    v_contact_record.city,\n    v_contact_record.state,\n    v_contact_record.zip_code,\n    v_combined_description,\n    p_billable_type,\n    p_billable_by,\n    p_billable_by_user_id,\n    p_priority,\n    p_notes,\n    'pending'\n  )\n  RETURNING id INTO v_service_request_id

\n\n  -- Update all punchlist tasks\n  FOREACH v_task_id IN ARRAY p_task_ids\n  LOOP\n    UPDATE punchlist_tasks\n    SET\n      service_request_id = v_service_request_id,\n      status = 'requested',\n      combined_description = v_combined_description,\n      updated_at = now()\n    WHERE id = v_task_id

\n  END LOOP

\n\n  RETURN v_service_request_id

\nEND

\n$$

\n\n-- Function to convert punchlist tasks to work order directly (bulk)\nCREATE OR REPLACE FUNCTION convert_punchlist_tasks_to_work_order(\n  p_task_ids uuid[],\n  p_contact_id uuid,\n  p_project_id uuid DEFAULT NULL,\n  p_work_order_type text DEFAULT 'service',\n  p_billable_type text DEFAULT 'billable',\n  p_priority text DEFAULT 'medium',\n  p_title text DEFAULT NULL,\n  p_description_override text DEFAULT NULL,\n  p_assigned_technician_ids uuid[] DEFAULT NULL,\n  p_start_date timestamptz DEFAULT NULL,\n  p_estimated_hours decimal DEFAULT NULL,\n  p_notes text DEFAULT NULL,\n  p_internal_notes text DEFAULT NULL\n)\nRETURNS uuid\nLANGUAGE plpgsql\nSECURITY DEFINER\nAS $$\nDECLARE\n  v_work_order_id uuid

\n  v_combined_description text

\n  v_contact_record record

\n  v_task_id uuid

\n  v_work_order_title text

\n  v_work_order_description text

\n  v_task_count int

\nBEGIN\n  -- Validate we have at least one task\n  IF array_length(p_task_ids, 1) IS NULL OR array_length(p_task_ids, 1) = 0 THEN\n    RAISE EXCEPTION 'At least one task ID is required'

\n  END IF

\n\n  -- Validate all tasks belong to the same contact\n  IF EXISTS (\n    SELECT 1 FROM punchlist_tasks\n    WHERE id = ANY(p_task_ids)\n    AND contact_id != p_contact_id\n  ) THEN\n    RAISE EXCEPTION 'All tasks must belong to the same contact'

\n  END IF

\n\n  -- Validate tasks are not already converted\n  IF EXISTS (\n    SELECT 1 FROM punchlist_tasks\n    WHERE id = ANY(p_task_ids)\n    AND (service_request_id IS NOT NULL OR work_order_id IS NOT NULL)\n  ) THEN\n    RAISE EXCEPTION 'One or more tasks have already been converted'

\n  END IF

\n\n  -- Get contact information\n  SELECT\n    full_name,\n    street_address,\n    city,\n    state,\n    zip_code\n  INTO v_contact_record\n  FROM contacts\n  WHERE id = p_contact_id

\n\n  IF NOT FOUND THEN\n    RAISE EXCEPTION 'Contact not found'

\n  END IF

\n\n  -- Generate combined description\n  v_combined_description := generate_combined_task_description(p_task_ids)

\n\n  -- Determine title\n  v_task_count := array_length(p_task_ids, 1)

\n  IF p_title IS NOT NULL THEN\n    v_work_order_title := p_title

\n  ELSIF v_task_count = 1 THEN\n    SELECT title INTO v_work_order_title FROM punchlist_tasks WHERE id = p_task_ids[1]

\n  ELSE\n    v_work_order_title := 'Punchlist Service - ' || v_contact_record.full_name || ' (' || v_task_count || ' tasks)'

\n  END IF

\n\n  -- Determine description\n  v_work_order_description := COALESCE(p_description_override, v_combined_description)

\n\n  -- Create work order\n  INSERT INTO work_orders (\n    contact_id,\n    project_id,\n    type,\n    billable_type,\n    title,\n    description,\n    priority,\n    status,\n    service_location_address,\n    service_location_city,\n    service_location_state,\n    service_location_zip,\n    start_date,\n    estimated_hours,\n    notes,\n    internal_notes,\n    created_by\n  ) VALUES (\n    p_contact_id,\n    p_project_id,\n    p_work_order_type,\n    p_billable_type,\n    v_work_order_title,\n    v_work_order_description,\n    p_priority,\n    CASE\n      WHEN p_assigned_technician_ids IS NOT NULL AND array_length(p_assigned_technician_ids, 1) > 0\n      THEN 'scheduled'\n      ELSE 'unscheduled'\n    END,\n    v_contact_record.street_address,\n    v_contact_record.city,\n    v_contact_record.state,\n    v_contact_record.zip_code,\n    p_start_date,\n    p_estimated_hours,\n    p_notes,\n    p_internal_notes,\n    auth.uid()\n  )\n  RETURNING id INTO v_work_order_id

\n\n  -- Assign technicians if provided\n  IF p_assigned_technician_ids IS NOT NULL AND array_length(p_assigned_technician_ids, 1) > 0 THEN\n    INSERT INTO work_order_assignments (work_order_id, user_id)\n    SELECT v_work_order_id, unnest(p_assigned_technician_ids)

\n  END IF

\n\n  -- Update all punchlist tasks\n  FOREACH v_task_id IN ARRAY p_task_ids\n  LOOP\n    UPDATE punchlist_tasks\n    SET\n      work_order_id = v_work_order_id,\n      status = CASE\n        WHEN p_start_date IS NOT NULL THEN 'scheduled'\n        ELSE 'in_work_order'\n      END,\n      combined_description = v_combined_description,\n      updated_at = now()\n    WHERE id = v_task_id

\n  END LOOP

\n\n  -- Create activity feed entry\n  INSERT INTO activity_feed (type, user_id, metadata)\n  VALUES (\n    'work_order_created',\n    auth.uid(),\n    jsonb_build_object(\n      'work_order_id', v_work_order_id,\n      'source', 'punchlist',\n      'task_count', v_task_count,\n      'contact_id', p_contact_id\n    )\n  )

\n\n  RETURN v_work_order_id

\nEND

\n$$

\n\n-- Grant execute permissions\nGRANT EXECUTE ON FUNCTION generate_combined_task_description(uuid[]) TO authenticated

\nGRANT EXECUTE ON FUNCTION convert_punchlist_tasks_to_service_request(uuid[], uuid, text, text, text, uuid, text) TO authenticated

\nGRANT EXECUTE ON FUNCTION convert_punchlist_tasks_to_work_order(uuid[], uuid, uuid, text, text, text, text, text, uuid[], timestamptz, decimal, text, text) TO authenticated

\n
