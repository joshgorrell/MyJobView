/*
  # Add Service Request Source Tracking

  ## Summary
  Adds origin tracking to service requests so staff can easily identify whether a request came from:
  - Customer punchlist submission
  - Staff service request form
  - Customer portal (future)
  - Other sources

  ## Changes
  
  1. New Column
    - `service_requests.source_type` - Tracks the origin of the service request
      - Options: 'punchlist', 'staff_form', 'customer_portal', 'other'
      - Default: 'staff_form' for backward compatibility
  
  2. Function Updates
    - Update convert_punchlist_tasks_to_service_request() to set source_type to 'punchlist'
  
  ## Benefits
  - Visual indicators in queue showing request origin
  - Filter and report by source type
  - Track punchlist conversion rates
  - Prioritize customer-initiated requests
  
  ## Security
  - No RLS changes needed (inherits from service_requests table)
*/

-- Add source_type column to service_requests
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'service_requests' AND column_name = 'source_type'
  ) THEN
    ALTER TABLE service_requests 
    ADD COLUMN source_type text NOT NULL DEFAULT 'staff_form'
    CHECK (source_type IN ('punchlist', 'staff_form', 'customer_portal', 'other'));
  END IF;
END $$;

-- Add index for filtering by source type
CREATE INDEX IF NOT EXISTS idx_service_requests_source_type 
ON service_requests(source_type) 
WHERE source_type IS NOT NULL;

-- Update the punchlist conversion function to set source_type
CREATE OR REPLACE FUNCTION convert_punchlist_tasks_to_service_request(
  p_task_ids uuid[],
  p_contact_id uuid,
  p_billable_type text DEFAULT 'warranty',
  p_billable_by text DEFAULT 'company',
  p_billable_by_user_id uuid DEFAULT NULL,
  p_priority text DEFAULT 'medium',
  p_requested_tech_ids uuid[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_request_id uuid;
  v_task record;
  v_combined_description text := '';
  v_contact record;
  v_organization_id uuid;
BEGIN
  -- Get organization_id from auth
  SELECT organization_id INTO v_organization_id
  FROM profiles
  WHERE id = auth.uid();

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'User must belong to an organization';
  END IF;

  -- Get contact details
  SELECT * INTO v_contact
  FROM contacts
  WHERE id = p_contact_id AND organization_id = v_organization_id;

  IF v_contact IS NULL THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  -- Combine all task descriptions
  FOR v_task IN 
    SELECT title, details
    FROM punchlist_tasks
    WHERE id = ANY(p_task_ids)
    AND contact_id = p_contact_id
    ORDER BY priority_order
  LOOP
    v_combined_description := v_combined_description || '• ' || v_task.title;
    IF v_task.details IS NOT NULL AND v_task.details != '' THEN
      v_combined_description := v_combined_description || E'\n  ' || v_task.details;
    END IF;
    v_combined_description := v_combined_description || E'\n\n';
  END LOOP;

  -- Create service request with source_type set to 'punchlist'
  INSERT INTO service_requests (
    contact_id,
    customer_name,
    customer_phone,
    customer_email,
    job_location_address,
    job_location_city,
    job_location_state,
    job_location_zip,
    job_description,
    billable_type,
    billable_by,
    billable_by_user_id,
    priority,
    requested_tech_ids,
    status,
    notes,
    created_by,
    created_by_name,
    organization_id,
    source_type
  ) VALUES (
    p_contact_id,
    v_contact.full_name,
    v_contact.phone,
    v_contact.email,
    COALESCE(v_contact.address, 'No address on file'),
    v_contact.city,
    v_contact.state,
    v_contact.zip,
    'Punchlist items submitted by customer',
    p_billable_type,
    p_billable_by,
    p_billable_by_user_id,
    p_priority,
    p_requested_tech_ids,
    'pending',
    v_combined_description,
    auth.uid(),
    (SELECT full_name FROM profiles WHERE id = auth.uid()),
    v_organization_id,
    'punchlist'
  ) RETURNING id INTO v_service_request_id;

  -- Update punchlist tasks with service request ID and set status to submitted
  UPDATE punchlist_tasks
  SET 
    service_request_id = v_service_request_id,
    status = 'submitted',
    updated_at = now()
  WHERE id = ANY(p_task_ids);

  RETURN v_service_request_id;
END;
$$;