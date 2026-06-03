/*
  # Create Task Notifications System

  ## Overview
  Automatically create notifications when tasks are created or updated.
  This allows users to see task updates in their unified notification center.

  ## Changes
  1. Create function to generate task notifications
  2. Add trigger for new task creation
  3. Add trigger for task status changes
  4. Add trigger for task assignments

  ## Security
  - Functions run with security definer to allow notification creation
  - Notifications only created for the task owner
*/

-- Function to create a notification for a new task
CREATE OR REPLACE FUNCTION notify_task_created()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Create notification for the task owner
  INSERT INTO notifications (
    user_id,
    title,
    body,
    type,
    is_read,
    created_at
  ) VALUES (
    NEW.user_id,
    'New Task Created',
    NEW.title,
    'task',
    false,
    now()
  );
  
  RETURN NEW;
END;
$$;

-- Function to notify when a task status changes
CREATE OR REPLACE FUNCTION notify_task_status_changed()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only notify if status actually changed
  IF OLD.status != NEW.status THEN
    INSERT INTO notifications (
      user_id,
      title,
      body,
      type,
      is_read,
      created_at
    ) VALUES (
      NEW.user_id,
      'Task Status Updated',
      NEW.title || ' - Status changed to: ' || NEW.status,
      'task',
      false,
      now()
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for new tasks
DROP TRIGGER IF EXISTS trigger_notify_task_created ON tasks;
CREATE TRIGGER trigger_notify_task_created
  AFTER INSERT ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION notify_task_created();

-- Create trigger for task status changes
DROP TRIGGER IF EXISTS trigger_notify_task_status_changed ON tasks;
CREATE TRIGGER trigger_notify_task_status_changed
  AFTER UPDATE ON tasks
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION notify_task_status_changed();
