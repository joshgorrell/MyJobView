/*
  # Update Work Order Notifications - Same Day Only

  1. Changes
    - Modify notification trigger to only notify for same-day work orders
    - Check start_date or target_completion_date against today's date
    - No notifications for future-scheduled work
  
  2. Logic
    - Only send notification if work order start_date is today
    - This prevents notification spam for future-scheduled jobs
    - Technicians only get alerted about work they need to do today
*/

-- Update function to only notify for same-day work orders
CREATE OR REPLACE FUNCTION notify_work_order_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_date date := CURRENT_DATE;
  work_order_date date;
BEGIN
  -- Only notify if assigned_to changed and is not null
  IF NEW.assigned_to IS NOT NULL AND (
    TG_OP = 'INSERT' OR 
    (TG_OP = 'UPDATE' AND (OLD.assigned_to IS NULL OR OLD.assigned_to != NEW.assigned_to))
  ) THEN
    -- Get the work order date (prefer start_date, fall back to target_completion_date)
    work_order_date := COALESCE(NEW.start_date::date, NEW.target_completion_date::date);
    
    -- Only notify if the work order is for today
    IF work_order_date = today_date THEN
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
        'New Work Order Assigned for Today',
        'Work Order ' || NEW.work_order_number || ' has been assigned to you for today. ' || COALESCE(NEW.title, ''),
        'work_order_assignment',
        false,
        now()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION notify_work_order_assignment IS 'Sends real-time notifications to technicians when same-day work orders are assigned to them';
