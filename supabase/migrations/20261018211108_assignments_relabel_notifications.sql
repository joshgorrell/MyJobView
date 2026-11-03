/*
# Update notification labels from "Task" to "Assignment"

1. Changes
- Updates the `notify_task_assigned()` trigger function so notification
  titles say "Assignment Assigned to You" (was "Task Assigned to You") and
  "{Department} Assignment" (was "{Department} Task Assigned").
- The notification `type` stays as `task_assigned` to avoid breaking
  existing notification handling code in the frontend (which checks
  `type IN ('task_assigned','task')`).

2. Security
- The function is SECURITY DEFINER and runs with search_path = 'public'.
  No security-relevant changes — only the notification title text changes.

3. Important Notes
- Uses CREATE OR REPLACE so the function signature and dependencies
  remain unchanged. All existing triggers that call this function
  (trigger_notify_task_assigned) continue to work without modification.
*/

CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_customer_name text;
  v_body text;
  v_department_name text;
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    SELECT COALESCE(full_name, company_name)
      INTO v_customer_name
    FROM contacts
    WHERE id = NEW.contact_id;
  END IF;

  v_body := CASE
    WHEN NULLIF(v_customer_name, '') IS NOT NULL
      THEN NEW.title || ' — ' || v_customer_name
    ELSE NEW.title
  END;

  -- Person assignment: notify only that employee.
  IF NEW.assigned_to IS NOT NULL
     AND (
       TG_OP = 'INSERT'
       OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to
       OR OLD.assigned_department_id IS DISTINCT FROM NEW.assigned_department_id
     ) THEN
    INSERT INTO notifications (user_id, title, body, type, is_read, related_id, created_at)
    VALUES (NEW.assigned_to, 'Assignment Assigned to You', v_body, 'task_assigned', false, NEW.id, now());
  END IF;

  -- Department assignment: notify every active member once when the assignment enters/moves departments.
  IF NEW.assigned_department_id IS NOT NULL
     AND (
       TG_OP = 'INSERT'
       OR OLD.assigned_department_id IS DISTINCT FROM NEW.assigned_department_id
       OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to
     ) THEN
    SELECT display_name INTO v_department_name
    FROM departments
    WHERE id = NEW.assigned_department_id;

    INSERT INTO notifications (user_id, title, body, type, is_read, related_id, created_at)
    SELECT p.id,
           COALESCE(v_department_name, 'Department') || ' Assignment',
           v_body,
           'task_assigned',
           false,
           NEW.id,
           now()
    FROM profiles p
    WHERE COALESCE(p.is_active, true) = true
      AND private.user_has_department_access(p.id, NEW.assigned_department_id);
  END IF;

  RETURN NEW;
END;
$function$;
