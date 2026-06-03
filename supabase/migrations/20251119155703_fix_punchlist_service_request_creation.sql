/*
  # Fix Punchlist Service Request Creation
  
  1. Changes
    - Update request_punchlist_service function to use correct service_requests fields
    - Remove non-existent fields (request_type, source)
    - Use correct status ('open' instead of 'pending_review')
    - Include all required fields from service_requests table
    
  2. Required Fields
    - customer_name, customer_phone, customer_email
    - job_location_address (and city, state, zip)
    - job_description
    - billable_type, billable_by
    - status (defaults to 'open')
*/

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

  -- Create service request with all required fields
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
    priority,
    notes,
    status
  ) VALUES (
    p_contact_id,
    COALESCE(v_contact.full_name, v_contact.company_name, 'Unknown Customer'),
    v_contact.phone,
    v_contact.email,
    COALESCE(v_contact.street_address, 'Address on file'),
    v_contact.city,
    v_contact.state,
    v_contact.zip_code,
    'Punchlist Service Request' || E'\n\nTasks:' || E'\n' || v_task_titles || COALESCE(E'\n\nNotes: ' || p_notes, ''),
    'warranty',
    'admin',
    'normal',
    'Created from customer punchlist portal',
    'open'
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