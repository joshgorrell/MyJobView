/*
  # Fix change_order_history organization_id NOT NULL constraint

  The organization_id column uses get_user_org_id() as its default, but this
  returns NULL when auth context is unavailable in the SECURITY DEFINER trigger.
  Making it nullable prevents the constraint violation.

  Also update the trigger function to populate organization_id from the
  change_order record itself instead of relying on auth context.
*/
ALTER TABLE change_order_history ALTER COLUMN organization_id DROP NOT NULL;

-- Update the trigger to source organization_id from the change order record
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
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'deleted';
    v_description := 'Change order deleted';
    v_snapshot := to_jsonb(OLD);
    v_org_id := OLD.organization_id;
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
    COALESCE(NEW.id, OLD.id),
    v_action,
    auth.uid(),
    v_description,
    v_snapshot,
    v_org_id,
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;
