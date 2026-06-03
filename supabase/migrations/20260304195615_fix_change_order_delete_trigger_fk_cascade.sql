/*
  # Fix change order delete: cascade history and skip delete logging

  The log_change_order_action AFTER DELETE trigger tries to insert a row into
  change_order_history with the just-deleted change_order_id, which violates
  the FK constraint.

  Fix:
  1. Add ON DELETE CASCADE to change_order_history.change_order_id FK so
     history rows are automatically cleaned up when a change order is deleted.
  2. Update the trigger function to skip logging on DELETE (the record is gone,
     and the cascade will clean up history anyway).
*/

-- Drop and recreate the FK with CASCADE
ALTER TABLE change_order_history
  DROP CONSTRAINT IF EXISTS change_order_history_change_order_id_fkey;

ALTER TABLE change_order_history
  ADD CONSTRAINT change_order_history_change_order_id_fkey
  FOREIGN KEY (change_order_id) REFERENCES change_orders(id) ON DELETE CASCADE;

-- Update trigger to not attempt logging on DELETE
CREATE OR REPLACE FUNCTION log_change_order_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_description text;
  v_snapshot jsonb;
  v_org_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
    v_description := 'Change order created';
    v_snapshot := to_jsonb(NEW);
    v_org_id := NEW.organization_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status != OLD.status THEN
      v_action := 'status_changed';
      v_description := 'Status changed from ' || OLD.status || ' to ' || NEW.status;
    ELSE
      v_action := 'modified';
      v_description := 'Change order modified';
    END IF;
    v_snapshot := to_jsonb(OLD);
    v_org_id := NEW.organization_id;
  END IF;

  INSERT INTO change_order_history (
    change_order_id,
    action,
    performed_by,
    description,
    snapshot,
    organization_id,
    created_at
  ) VALUES (
    NEW.id,
    v_action,
    auth.uid(),
    v_description,
    v_snapshot,
    v_org_id,
    now()
  );

  RETURN NEW;
END;
$$;
