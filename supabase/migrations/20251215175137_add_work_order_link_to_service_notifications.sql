/*
  # Add Work Order Link to Service Request Notifications

  ## Summary
  Updates service request notifications to include the work_order_id in the related_id field
  so users can click directly to the created work order.

  ## Changes
  - Update notify_service_managers_new_request to include work_order_id as related_id
  - Update notify_work_order_assignment to include work_order_id as related_id

  ## Notes
  - Service requests are auto-converted to work orders, so we can access work_order_id
  - Notifications will now be clickable to navigate to the work order
*/

-- Update service manager notification function to include work_order link
CREATE OR REPLACE FUNCTION notify_service_managers_new_request()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_service_manager record;
  v_is_punchlist boolean;
  v_notification_type text;
  v_title text;
  v_body text;
BEGIN
  -- Check if this is a punchlist service request
  v_is_punchlist := (NEW.notes ILIKE '%Created from customer punchlist portal%');
  
  -- Set notification details based on source
  IF v_is_punchlist THEN
    v_notification_type := 'punchlist_service_request';
    v_title := 'New Punchlist Service Request';
    v_body := 'Customer ' || NEW.customer_name || ' submitted a punchlist service request';
  ELSE
    v_notification_type := 'service_request_created';
    v_title := 'New Service Request';
    v_body := 'Service request from ' || NEW.customer_name || ': ' || LEFT(NEW.job_description, 100);
  END IF;

  -- Create notification for all service managers
  FOR v_service_manager IN 
    SELECT p.id as user_id
    FROM profiles p
    WHERE p.role = 'service_manager'
      AND p.is_active = true
  LOOP
    -- Insert in-app notification with work order link
    INSERT INTO notifications (
      user_id,
      title,
      body,
      type,
      related_id,
      is_read,
      created_at
    ) VALUES (
      v_service_manager.user_id,
      v_title,
      v_body,
      v_notification_type,
      NEW.work_order_id,  -- Link to the auto-created work order
      false,
      now()
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- Update work order assignment notification to include work order link
CREATE OR REPLACE FUNCTION notify_work_order_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only notify if assigned_to changed and is not null
  IF NEW.assigned_to IS NOT NULL AND (
    TG_OP = 'INSERT' OR 
    (TG_OP = 'UPDATE' AND (OLD.assigned_to IS NULL OR OLD.assigned_to != NEW.assigned_to))
  ) THEN
    -- Create notification for the technician
    INSERT INTO notifications (
      user_id,
      title,
      body,
      type,
      related_id,
      is_read,
      created_at
    )
    VALUES (
      NEW.assigned_to,
      'New Work Order Assigned',
      'Work Order ' || NEW.work_order_number || ' has been assigned to you. ' || COALESCE(NEW.title, ''),
      'work_order_assignment',
      NEW.id,  -- Link to the work order
      false,
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION notify_service_managers_new_request IS 'Notifies service managers of new service requests and includes work order link';
COMMENT ON FUNCTION notify_work_order_assignment IS 'Notifies technicians when work orders are assigned and includes work order link';
