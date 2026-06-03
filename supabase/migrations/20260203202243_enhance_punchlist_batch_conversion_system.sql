/*
  # Enhance Punchlist Batch Conversion System

  1. Changes
    - Add work_order_id to punchlist_tasks for direct work order linking
    - Add combined_description field for merged task descriptions
    - Extend status constraint to include 'scheduled' and 'in_work_order'
    - Create function to generate combined task descriptions
    - Create function to convert multiple tasks to service request
    - Create function to convert multiple tasks to work order

  2. Security
    - Functions use SECURITY DEFINER with proper validation
    - Maintain existing RLS policies
*/

-- Add work_order_id column to punchlist_tasks
ALTER TABLE punchlist_tasks
ADD COLUMN IF NOT EXISTS work_order_id uuid REFERENCES work_orders(id) ON DELETE SET NULL;

-- Add combined_description for merged descriptions
ALTER TABLE punchlist_tasks
ADD COLUMN IF NOT EXISTS combined_description text;

-- Add index for work_order_id lookups
CREATE INDEX IF NOT EXISTS idx_punchlist_tasks_work_order_id
ON punchlist_tasks(work_order_id) WHERE work_order_id IS NOT NULL;

-- Update status constraint to include new statuses
ALTER TABLE punchlist_tasks
DROP CONSTRAINT IF EXISTS punchlist_tasks_status_check;

ALTER TABLE punchlist_tasks
ADD CONSTRAINT punchlist_tasks_status_check
CHECK (status IN ('draft', 'completed', 'scheduled', 'in_work_order'));

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS generate_combined_task_description(uuid[]);

-- Function to generate combined description from multiple tasks
CREATE FUNCTION generate_combined_task_description(task_ids uuid[])
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_description text := '';
  v_task record;
  v_count int := 0;
BEGIN
  -- Build combined description from all tasks
  FOR v_task IN
    SELECT title, details, installer_notes
    FROM punchlist_tasks
    WHERE id = ANY(task_ids)
    ORDER BY priority_order, created_at
  LOOP
    v_count := v_count + 1;
    v_description := v_description || 'Task ' || v_count || ': ' || v_task.title || E'\n';

    IF v_task.details IS NOT NULL THEN
      v_description := v_description || v_task.details || E'\n';
    END IF;

    IF v_task.installer_notes IS NOT NULL THEN
      v_description := v_description || 'Notes: ' || v_task.installer_notes || E'\n';
    END IF;

    v_description := v_description || E'\n';
  END LOOP;

  RETURN TRIM(v_description);
END;
$$;

-- Function to convert multiple punchlist tasks to service request
CREATE OR REPLACE FUNCTION convert_punchlist_tasks_to_service_request(
  p_task_ids uuid[],
  p_description text,
  p_urgency text DEFAULT 'medium',
  p_scheduled_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_service_request_id uuid;
  v_contact_id uuid;
  v_contact_name text;
  v_combined_description text;
  v_company_id uuid;
  v_task record;
BEGIN
  -- Validate we have tasks
  IF array_length(p_task_ids, 1) IS NULL OR array_length(p_task_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No tasks provided';
  END IF;

  -- Get company_id (single-tenant)
  SELECT id INTO v_company_id FROM company_settings LIMIT 1;

  -- Verify all tasks are from the same contact and are draft status
  SELECT DISTINCT contact_id INTO v_contact_id
  FROM punchlist_tasks
  WHERE id = ANY(p_task_ids);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tasks not found';
  END IF;

  -- Check if we got more than one distinct contact
  IF (SELECT COUNT(DISTINCT contact_id) FROM punchlist_tasks WHERE id = ANY(p_task_ids)) > 1 THEN
    RAISE EXCEPTION 'All tasks must belong to the same contact';
  END IF;

  -- Verify all tasks are draft status
  IF EXISTS (SELECT 1 FROM punchlist_tasks WHERE id = ANY(p_task_ids) AND status != 'draft') THEN
    RAISE EXCEPTION 'All tasks must be in draft status';
  END IF;

  -- Get contact name
  SELECT full_name INTO v_contact_name FROM contacts WHERE id = v_contact_id;

  -- Generate combined description
  v_combined_description := generate_combined_task_description(p_task_ids);

  -- Create service request
  INSERT INTO service_requests (
    company_id,
    contact_id,
    description,
    status,
    urgency,
    scheduled_date,
    notes,
    created_by
  ) VALUES (
    v_company_id,
    v_contact_id,
    COALESCE(p_description, 'Punchlist Items - ' || v_contact_name),
    CASE WHEN p_scheduled_date IS NOT NULL THEN 'scheduled' ELSE 'new' END,
    p_urgency,
    p_scheduled_date,
    v_combined_description,
    auth.uid()
  )
  RETURNING id INTO v_service_request_id;

  -- Update all tasks to link to service request and change status
  UPDATE punchlist_tasks
  SET
    service_request_id = v_service_request_id,
    status = 'scheduled',
    combined_description = v_combined_description,
    updated_at = now()
  WHERE id = ANY(p_task_ids);

  RETURN v_service_request_id;
END;
$$;

-- Function to convert multiple punchlist tasks directly to work order
CREATE OR REPLACE FUNCTION convert_punchlist_tasks_to_work_order(
  p_task_ids uuid[],
  p_description text,
  p_assigned_to uuid[],
  p_scheduled_date date,
  p_scheduled_time time DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_work_order_id uuid;
  v_contact_id uuid;
  v_contact_name text;
  v_combined_description text;
  v_company_id uuid;
  v_tech_id uuid;
BEGIN
  -- Validate we have tasks
  IF array_length(p_task_ids, 1) IS NULL OR array_length(p_task_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No tasks provided';
  END IF;

  -- Get company_id (single-tenant)
  SELECT id INTO v_company_id FROM company_settings LIMIT 1;

  -- Verify all tasks are from the same contact and are draft status
  SELECT DISTINCT contact_id INTO v_contact_id
  FROM punchlist_tasks
  WHERE id = ANY(p_task_ids);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tasks not found';
  END IF;

  -- Check if we got more than one distinct contact
  IF (SELECT COUNT(DISTINCT contact_id) FROM punchlist_tasks WHERE id = ANY(p_task_ids)) > 1 THEN
    RAISE EXCEPTION 'All tasks must belong to the same contact';
  END IF;

  -- Verify all tasks are draft status
  IF EXISTS (SELECT 1 FROM punchlist_tasks WHERE id = ANY(p_task_ids) AND status != 'draft') THEN
    RAISE EXCEPTION 'All tasks must be in draft status';
  END IF;

  -- Get contact name
  SELECT full_name INTO v_contact_name FROM contacts WHERE id = v_contact_id;

  -- Generate combined description
  v_combined_description := generate_combined_task_description(p_task_ids);

  -- Create work order
  INSERT INTO work_orders (
    company_id,
    contact_id,
    type,
    description,
    status,
    scheduled_date,
    scheduled_time,
    notes,
    created_by
  ) VALUES (
    v_company_id,
    v_contact_id,
    'punchlist',
    COALESCE(p_description, 'Punchlist Items - ' || v_contact_name),
    'scheduled',
    p_scheduled_date,
    p_scheduled_time,
    COALESCE(p_notes, '') || E'\n\nPunchlist Tasks:\n' || v_combined_description,
    auth.uid()
  )
  RETURNING id INTO v_work_order_id;

  -- Assign technicians
  IF p_assigned_to IS NOT NULL AND array_length(p_assigned_to, 1) > 0 THEN
    FOREACH v_tech_id IN ARRAY p_assigned_to
    LOOP
      INSERT INTO work_order_assignments (
        work_order_id,
        user_id,
        role,
        assigned_at,
        assigned_by
      ) VALUES (
        v_work_order_id,
        v_tech_id,
        'technician',
        now(),
        auth.uid()
      );
    END LOOP;
  END IF;

  -- Update all tasks to link to work order and change status
  UPDATE punchlist_tasks
  SET
    work_order_id = v_work_order_id,
    status = 'in_work_order',
    combined_description = v_combined_description,
    updated_at = now()
  WHERE id = ANY(p_task_ids);

  RETURN v_work_order_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION generate_combined_task_description(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION convert_punchlist_tasks_to_service_request(uuid[], text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION convert_punchlist_tasks_to_work_order(uuid[], text, uuid[], date, time, text) TO authenticated;