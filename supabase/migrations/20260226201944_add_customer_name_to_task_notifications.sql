/*
  # Add Customer Name to Task Notifications

  ## Changes
  - Updates notify_task_assigned() to include customer name in notification body
  - Looks up contact name from the tasks.contact_id foreign key
  - Format: "Task title — Customer Name" or just "Task title" if no contact linked
*/

CREATE OR REPLACE FUNCTION notify_task_assigned()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_customer_name text;
  v_body text;
BEGIN
  -- Look up customer name from contact if linked
  IF NEW.contact_id IS NOT NULL THEN
    SELECT COALESCE(full_name, company_name)
    INTO v_customer_name
    FROM contacts
    WHERE id = NEW.contact_id;
  END IF;

  -- Build body with customer name if available
  IF v_customer_name IS NOT NULL AND v_customer_name <> '' THEN
    v_body := NEW.title || ' — ' || v_customer_name;
  ELSE
    v_body := NEW.title;
  END IF;

  -- On INSERT: Notify if task is assigned to someone
  IF TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL THEN
    INSERT INTO notifications (
      user_id,
      title,
      body,
      type,
      is_read,
      related_id,
      created_at
    ) VALUES (
      NEW.assigned_to,
      'Task Assigned to You',
      v_body,
      'task_assigned',
      false,
      NEW.id,
      now()
    );
  END IF;

  -- On UPDATE: Notify if assignment changed and is now assigned to someone
  IF TG_OP = 'UPDATE' AND
     (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) AND
     NEW.assigned_to IS NOT NULL THEN
    INSERT INTO notifications (
      user_id,
      title,
      body,
      type,
      is_read,
      related_id,
      created_at
    ) VALUES (
      NEW.assigned_to,
      'Task Assigned to You',
      v_body,
      'task_assigned',
      false,
      NEW.id,
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;
