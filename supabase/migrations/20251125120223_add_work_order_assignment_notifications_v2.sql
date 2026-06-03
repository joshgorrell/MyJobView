/*
  # Work Order Assignment Notifications

  1. Changes
    - Create trigger to notify technicians when work orders are assigned to them
    - Remove constraint on notification type to allow flexibility
    - Ensure technicians get real-time alerts about new jobs
  
  2. Notes
    - Notifications sent when assigned_to changes from null to a technician
    - Notifications sent when assigned_to changes from one tech to another
    - Uses existing notifications table
*/

-- Remove the type constraint to allow any notification type
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Function to notify technician of work order assignment
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
      is_read,
      created_at
    )
    VALUES (
      NEW.assigned_to,
      'New Work Order Assigned',
      'Work Order ' || NEW.work_order_number || ' has been assigned to you. ' || COALESCE(NEW.title, ''),
      'work_order_assignment',
      false,
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Drop trigger if it exists and recreate
DROP TRIGGER IF EXISTS work_order_assignment_notification ON work_orders;

CREATE TRIGGER work_order_assignment_notification
  AFTER INSERT OR UPDATE OF assigned_to
  ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION notify_work_order_assignment();

COMMENT ON FUNCTION notify_work_order_assignment IS 'Sends real-time notifications to technicians when work orders are assigned to them';
