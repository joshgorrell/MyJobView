/*
  # Combine Multiple Service Requests into One Work Order

  ## Summary
  Adds a stored procedure that allows dispatchers/admins to combine multiple
  service requests (from the same customer) into a single work order. This is
  an admin-side operation performed from the Service Request Queue page.

  ## New Functions
  - `combine_service_requests_to_work_order` — validates all requests belong to
    the same contact, creates one work order of type 'service', links every
    provided service request to it, and marks them as scheduled.

  ## Notes
  - No schema changes required: service_requests.work_order_id has no UNIQUE
    constraint, so multiple rows can already point to the same work_order id.
  - The function runs SECURITY DEFINER so it can write to both work_orders and
    service_requests tables in one atomic operation.
*/

CREATE OR REPLACE FUNCTION combine_service_requests_to_work_order(
  p_service_request_ids uuid[],
  p_tech_ids            uuid[],
  p_scheduled_date      date,
  p_scheduled_time      text,
  p_estimated_hours     numeric,
  p_description         text,
  p_internal_notes      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_id        uuid;
  v_company_id        uuid;
  v_priority          text;
  v_billable_type     text;
  v_address           text;
  v_city              text;
  v_state             text;
  v_zip               text;
  v_project_id        uuid;
  v_work_order_id     uuid;
  v_work_order_number text;
  v_tech_id           uuid;
  v_sr                record;
  v_distinct_contacts int;
BEGIN
  -- Validate we got at least one service request and one tech
  IF array_length(p_service_request_ids, 1) IS NULL OR array_length(p_service_request_ids, 1) < 1 THEN
    RAISE EXCEPTION 'At least one service request is required';
  END IF;

  IF array_length(p_tech_ids, 1) IS NULL OR array_length(p_tech_ids, 1) < 1 THEN
    RAISE EXCEPTION 'At least one technician is required';
  END IF;

  -- Ensure all provided service requests belong to the same contact
  SELECT COUNT(DISTINCT contact_id)
    INTO v_distinct_contacts
    FROM service_requests
   WHERE id = ANY(p_service_request_ids);

  IF v_distinct_contacts > 1 THEN
    RAISE EXCEPTION 'All service requests must belong to the same customer';
  END IF;

  -- Load the common attributes from the first service request
  SELECT
    contact_id,
    company_id,
    priority,
    billable_type,
    job_location_address,
    job_location_city,
    job_location_state,
    job_location_zip
  INTO
    v_contact_id,
    v_company_id,
    v_priority,
    v_billable_type,
    v_address,
    v_city,
    v_state,
    v_zip
  FROM service_requests
  WHERE id = p_service_request_ids[1];

  -- Find or create a "Service Work" project for the contact
  SELECT id INTO v_project_id
    FROM projects
   WHERE contact_id = v_contact_id
     AND project_name = 'Service Work'
   LIMIT 1;

  IF v_project_id IS NULL THEN
    INSERT INTO projects (company_id, contact_id, project_name, status)
    VALUES (v_company_id, v_contact_id, 'Service Work', 'active')
    RETURNING id INTO v_project_id;
  END IF;

  -- Generate a work order number
  v_work_order_number := 'WO-' || LPAD(EXTRACT(EPOCH FROM now())::bigint::text, 10, '0') || '-' || UPPER(SUBSTR(MD5(RANDOM()::text), 1, 4));

  -- Create one work order (one per tech — we create only the first one here and
  -- loop below for additional techs, but all SRs point to the first WO)
  v_tech_id := p_tech_ids[1];

  INSERT INTO work_orders (
    company_id,
    project_id,
    work_order_number,
    title,
    description,
    type,
    status,
    priority,
    assigned_to,
    start_date,
    estimated_hours,
    internal_notes,
    created_by,
    contact_id,
    billable_type,
    address,
    service_location_address,
    service_location_city,
    service_location_state,
    service_location_zip
  )
  VALUES (
    v_company_id,
    v_project_id,
    v_work_order_number,
    'Service: ' || LEFT(p_description, 60),
    p_description,
    'service',
    'scheduled',
    v_priority,
    v_tech_id,
    p_scheduled_date,
    p_estimated_hours,
    p_internal_notes,
    auth.uid(),
    v_contact_id,
    v_billable_type,
    v_address,
    v_address,
    v_city,
    v_state,
    v_zip
  )
  RETURNING id INTO v_work_order_id;

  -- For additional techs, create additional work orders (linked to same SRs)
  IF array_length(p_tech_ids, 1) > 1 THEN
    FOR i IN 2 .. array_length(p_tech_ids, 1) LOOP
      INSERT INTO work_orders (
        company_id,
        project_id,
        work_order_number,
        title,
        description,
        type,
        status,
        priority,
        assigned_to,
        start_date,
        estimated_hours,
        internal_notes,
        created_by,
        contact_id,
        billable_type,
        address,
        service_location_address,
        service_location_city,
        service_location_state,
        service_location_zip
      )
      VALUES (
        v_company_id,
        v_project_id,
        'WO-' || LPAD(EXTRACT(EPOCH FROM now())::bigint::text, 10, '0') || '-' || UPPER(SUBSTR(MD5(RANDOM()::text), 1, 4)),
        'Service: ' || LEFT(p_description, 60),
        p_description,
        'service',
        'scheduled',
        v_priority,
        p_tech_ids[i],
        p_scheduled_date,
        p_estimated_hours,
        p_internal_notes,
        auth.uid(),
        v_contact_id,
        v_billable_type,
        v_address,
        v_address,
        v_city,
        v_state,
        v_zip
      );
    END LOOP;
  END IF;

  -- Mark all service requests as scheduled and link them to the primary work order
  UPDATE service_requests
     SET status         = 'scheduled',
         work_order_id  = v_work_order_id,
         updated_at     = NOW()
   WHERE id = ANY(p_service_request_ids);

  RETURN v_work_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION combine_service_requests_to_work_order(uuid[], uuid[], date, text, numeric, text, text) TO authenticated;
