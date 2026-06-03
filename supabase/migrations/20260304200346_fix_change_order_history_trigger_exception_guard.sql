/*
  # Fix change order history trigger - add exception guard

  The log_change_order_action trigger fires AFTER INSERT on change_orders.
  If the history insert fails for any reason (RLS, null org_id, FK violation),
  it rolls back the entire change order creation.

  Fix: wrap the history insert in an exception handler so a logging failure
  never blocks creating a change order. Also guard against null organization_id.
*/

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

  BEGIN
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
  EXCEPTION WHEN OTHERS THEN
    -- History logging failure must never block the change order operation
    NULL;
  END;

  RETURN NEW;
END;
$$;
