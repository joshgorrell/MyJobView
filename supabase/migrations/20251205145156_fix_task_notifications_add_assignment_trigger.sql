/*
  # Fix Task Notifications - Add Assignment Notifications

  ## Problem
  - Currently, task creators get notified when they create a task (not useful)
  - Task assignees don't get notified when a task is assigned to them
  - When you create a task for yourself, you don't get a useful notification

  ## Solution
  - Remove the creator notification (you don't need to be notified of your own actions)
  - Add assignment notifications for when tasks are assigned
  - Notify assignees when a task is assigned to them (even if self-assigned)

  ## Changes
  1. Drop the task creation notification trigger
  2. Create new function for task assignment notifications
  3. Add trigger for both INSERT and UPDATE (assignment changes)
*/

-- Drop the old creator notification trigger
DROP TRIGGER IF EXISTS trigger_notify_task_created ON tasks;
DROP FUNCTION IF EXISTS notify_task_created();

-- Function to notify when a task is assigned
CREATE OR REPLACE FUNCTION notify_task_assigned()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
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
      NEW.title,
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
      NEW.title,
      'task_assigned',
      false,
      NEW.id,
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for task assignments
CREATE TRIGGER trigger_notify_task_assigned
  AFTER INSERT OR UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION notify_task_assigned();

-- Update the status change notification to include task ID for deep linking
CREATE OR REPLACE FUNCTION notify_task_status_changed()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only notify if status actually changed
  IF OLD.status != NEW.status THEN
    -- Notify the assignee if there is one, otherwise notify the creator
    INSERT INTO notifications (
      user_id,
      title,
      body,
      type,
      is_read,
      related_id,
      created_at
    ) VALUES (
      COALESCE(NEW.assigned_to, NEW.user_id),
      'Task Status Updated',
      NEW.title || ' - Status changed to: ' || NEW.status,
      'task',
      false,
      NEW.id,
      now()
    );
  END IF;
  
  RETURN NEW;
END;
$$;
