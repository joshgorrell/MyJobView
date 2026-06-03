/*
  # Update request_punchlist_service to populate requested_at

  ## Summary
  Replaces the existing `request_punchlist_service` function to also set
  `requested_at = now()` when tasks transition from draft to requested.

  This gives us the exact timestamp of when the customer submitted the task,
  enabling "time-to-request" analysis (gap between created_at and requested_at).
*/

CREATE OR REPLACE FUNCTION public.request_punchlist_service(
  p_task_ids uuid[],
  p_contact_id uuid,
  p_notes text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Update all tasks to requested status, link to service request, and record requested_at
  UPDATE punchlist_tasks
  SET
    status = 'requested',
    service_request_id = v_service_request_id,
    requested_at = now(),
    updated_at = now()
  WHERE id = ANY(p_task_ids)
    AND status = 'draft';

  RETURN v_service_request_id;
END;
$function$;
