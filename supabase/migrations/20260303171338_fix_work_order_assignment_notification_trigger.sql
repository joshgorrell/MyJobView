
/*
  # Fix work order assignment notification trigger

  The notify_work_order_assignment trigger was inserting into notifications
  without the required organization_id column, causing NOT NULL constraint
  violations when inserting work orders.

  ## Changes
  - Rewrites the trigger function to include organization_id from the work order row
*/

CREATE OR REPLACE FUNCTION notify_work_order_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
    INSERT INTO notifications (
      user_id,
      title,
      body,
      type,
      related_id,
      organization_id,
      is_read,
      created_at
    )
    VALUES (
      NEW.assigned_to,
      'New Work Order Assigned',
      'Work Order ' || NEW.work_order_number || ' has been assigned to you. ' || COALESCE(NEW.title, ''),
      'work_order_assignment',
      NEW.id,
      NEW.organization_id,
      false,
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;
