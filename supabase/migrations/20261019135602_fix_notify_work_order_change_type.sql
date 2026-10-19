/*
# Fix notify_work_order_change: use valid notification type

## Summary

The `notify_work_order_change` trigger uses notification type 'work_order_change',
which is not in the `notifications_type_check` constraint. The allowed type is
'work_order'. This caused a constraint violation when a work order with an
assigned technician was updated.

## What This Fixes

Changes the notification type from 'work_order_change' to 'work_order'.

## Functions Modified
- public.notify_work_order_change — type 'work_order_change' -> 'work_order'

## Important Notes
- This is a pre-existing bug, not caused by the punchlist corrective migration.
- CREATE OR REPLACE FUNCTION makes this idempotent.
*/

CREATE OR REPLACE FUNCTION public.notify_work_order_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  changed_fields text[] := ARRAY[]::text[];
  change_summary text;
  tech_id uuid;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;

  tech_id := NEW.assigned_to;
  IF tech_id IS NULL THEN RETURN NEW; END IF;
  IF auth.uid() = tech_id THEN RETURN NEW; END IF;

  IF OLD.scheduled_date IS DISTINCT FROM NEW.scheduled_date THEN changed_fields := changed_fields || ARRAY['scheduled date']; END IF;
  IF OLD.description IS DISTINCT FROM NEW.description THEN changed_fields := changed_fields || ARRAY['description']; END IF;
  IF OLD.title IS DISTINCT FROM NEW.title THEN changed_fields := changed_fields || ARRAY['title']; END IF;
  IF OLD.address IS DISTINCT FROM NEW.address THEN changed_fields := changed_fields || ARRAY['address']; END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN changed_fields := changed_fields || ARRAY['status']; END IF;
  IF OLD.priority IS DISTINCT FROM NEW.priority THEN changed_fields := changed_fields || ARRAY['priority']; END IF;
  IF OLD.service_location_address IS DISTINCT FROM NEW.service_location_address THEN changed_fields := changed_fields || ARRAY['service location']; END IF;
  IF OLD.start_date IS DISTINCT FROM NEW.start_date THEN changed_fields := changed_fields || ARRAY['start date']; END IF;
  IF OLD.target_completion_date IS DISTINCT FROM NEW.target_completion_date THEN changed_fields := changed_fields || ARRAY['due date']; END IF;

  IF array_length(changed_fields, 1) IS NULL THEN RETURN NEW; END IF;

  change_summary := array_to_string(changed_fields, ', ');

  INSERT INTO notifications (
    user_id, title, body, type, related_id, organization_id, is_read, created_at
  ) VALUES (
    tech_id,
    'Work Order Updated',
    'Work Order ' || NEW.work_order_number || ' has been updated: ' || change_summary || '. ' || COALESCE(NEW.title, ''),
    'work_order',
    NEW.id, NEW.organization_id, false, now()
  );

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
