/*
  # Simplify Punchlist Task Statuses

  ## Summary
  Updates punchlist task statuses to a simpler 3-status workflow:
  1. Draft - Customer created but hasn't requested service
  2. Requested - Customer submitted for service (creates service request)
  3. Completed - Task is done (marked by customer or staff)

  ## Changes
  - Update status constraint to only allow: draft, requested, completed
  - Update existing tasks to map to new statuses
  - Remove pending, submitted, in_progress statuses
  - Add ability for both customer and staff to mark completed

  ## Status Mapping
  - draft → draft (unchanged)
  - pending → draft (customer hasn't submitted yet)
  - submitted → requested (customer requested service)
  - in_progress → requested (being worked on)
  - completed → completed (unchanged)
*/

-- First, migrate existing data to new statuses
UPDATE punchlist_tasks
SET status = CASE
  WHEN status IN ('pending', 'draft') THEN 'draft'
  WHEN status IN ('submitted', 'in_progress') THEN 'requested'
  WHEN status = 'completed' THEN 'completed'
  ELSE 'draft'
END
WHERE status NOT IN ('draft', 'requested', 'completed');

-- Update the status constraint
ALTER TABLE punchlist_tasks
DROP CONSTRAINT IF EXISTS punchlist_tasks_status_check;

ALTER TABLE punchlist_tasks
ADD CONSTRAINT punchlist_tasks_status_check
CHECK (status IN ('draft', 'requested', 'completed'));

-- Add completed_by field to track who marked it complete (customer or staff)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'punchlist_tasks' AND column_name = 'completed_by'
  ) THEN
    ALTER TABLE punchlist_tasks ADD COLUMN completed_by uuid REFERENCES profiles(id);
  END IF;
END $$;

-- Add service_request_id to link to service request when task is requested
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'punchlist_tasks' AND column_name = 'service_request_id'
  ) THEN
    ALTER TABLE punchlist_tasks ADD COLUMN service_request_id uuid REFERENCES service_requests(id);
  END IF;
END $$;

-- Create function to mark task as completed (can be called by customer or staff)
CREATE OR REPLACE FUNCTION mark_punchlist_task_completed(
  p_task_id uuid,
  p_completed_by uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE punchlist_tasks
  SET 
    status = 'completed',
    completed_at = now(),
    completed_by = COALESCE(p_completed_by, auth.uid()),
    updated_at = now()
  WHERE id = p_task_id;
END;
$$;

-- Create function to request service for tasks (single or multiple)
CREATE OR REPLACE FUNCTION request_punchlist_service(
  p_task_ids uuid[],
  p_contact_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_service_request_id uuid;
  v_task_id uuid;
  v_contact record;
  v_task_titles text := '';
BEGIN
  -- Get contact info
  SELECT * INTO v_contact FROM contacts WHERE id = p_contact_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  -- Build description from task titles
  FOR v_task_id IN SELECT unnest(p_task_ids)
  LOOP
    SELECT v_task_titles || '- ' || title || E'\n'
    INTO v_task_titles
    FROM punchlist_tasks
    WHERE id = v_task_id;
  END LOOP;

  -- Create service request
  INSERT INTO service_requests (
    contact_id,
    request_type,
    priority,
    description,
    status,
    source
  ) VALUES (
    p_contact_id,
    'punchlist',
    'normal',
    'Punchlist Tasks:' || E'\n' || v_task_titles || COALESCE(E'\n\nNotes: ' || p_notes, ''),
    'pending_review',
    'customer_portal'
  )
  RETURNING id INTO v_service_request_id;

  -- Update all tasks to requested status and link to service request
  UPDATE punchlist_tasks
  SET 
    status = 'requested',
    service_request_id = v_service_request_id,
    updated_at = now()
  WHERE id = ANY(p_task_ids)
  AND status = 'draft';

  RETURN v_service_request_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION mark_punchlist_task_completed(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION request_punchlist_service(uuid[], uuid, text) TO authenticated;

-- Add index on service_request_id
CREATE INDEX IF NOT EXISTS idx_punchlist_tasks_service_request 
  ON punchlist_tasks(service_request_id) 
  WHERE service_request_id IS NOT NULL;

-- Update RLS policies to allow customers to mark their own tasks complete
DROP POLICY IF EXISTS "Customers can update own punchlist tasks" ON punchlist_tasks;

CREATE POLICY "Customers can update own punchlist tasks"
  ON punchlist_tasks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM punchlist_access_grants
      WHERE punchlist_access_grants.contact_id = punchlist_tasks.contact_id
      AND punchlist_access_grants.contact_id IN (
        SELECT contact_id FROM profiles WHERE id = auth.uid()
      )
      AND punchlist_access_grants.status = 'active'
      AND (punchlist_access_grants.expiration_date IS NULL 
           OR punchlist_access_grants.expiration_date >= CURRENT_DATE)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM punchlist_access_grants
      WHERE punchlist_access_grants.contact_id = punchlist_tasks.contact_id
      AND punchlist_access_grants.contact_id IN (
        SELECT contact_id FROM profiles WHERE id = auth.uid()
      )
      AND punchlist_access_grants.status = 'active'
      AND (punchlist_access_grants.expiration_date IS NULL 
           OR punchlist_access_grants.expiration_date >= CURRENT_DATE)
    )
  );
