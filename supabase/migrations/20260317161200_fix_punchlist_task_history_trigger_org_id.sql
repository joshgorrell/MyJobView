/*
  # Fix log_punchlist_task_change trigger to supply organization_id

  ## Problem
  The trigger inserts into punchlist_task_history relying on the column default
  get_user_org_id() for organization_id. Portal users have no profile row, so
  get_user_org_id() returns NULL, violating the NOT NULL constraint.

  ## Fix
  Update the trigger function to explicitly pass NEW.organization_id from the
  punchlist_tasks row being inserted/updated.
*/

CREATE OR REPLACE FUNCTION public.log_punchlist_task_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO punchlist_task_history (task_id, changed_by, change_type, new_values, organization_id)
    VALUES (NEW.id, auth.uid(), 'created', to_jsonb(NEW), NEW.organization_id);
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (OLD.status != NEW.status) THEN
      INSERT INTO punchlist_task_history (task_id, changed_by, change_type, old_values, new_values, organization_id)
      VALUES (NEW.id, auth.uid(), 'status_changed',
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status),
        NEW.organization_id);
    ELSE
      INSERT INTO punchlist_task_history (task_id, changed_by, change_type, old_values, new_values, organization_id)
      VALUES (NEW.id, auth.uid(), 'updated', to_jsonb(OLD), to_jsonb(NEW), NEW.organization_id);
    END IF;

    IF (NEW.status = 'completed' AND OLD.status != 'completed') THEN
      UPDATE punchlist_tasks SET completed_at = now() WHERE id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
