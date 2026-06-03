/*
  # Work Order Dynamic Billable Status and Linking

  ## Summary
  Adds automatic billable status updates and post-creation linking capabilities:
  - Trigger to auto-update is_billable when type changes
  - Functions to link/unlink work orders after creation
  - Support for duplicating work orders with automatic linking

  ## Schema Changes
  
  ### Triggers:
  - Auto-set is_billable=true when type changes to 'service'
  - Auto-set is_billable=false when type changes to non-service types

  ## Functions
  
  ### link_work_orders
  Links multiple work orders together by creating or using a shared group_id
  
  ### unlink_work_order
  Removes a work order from its group
  
  ### duplicate_work_order_to_technician
  Creates a copy of a work order for another technician and links them together

  ## Notes
  - Service type work orders should always be billable by default
  - Work orders can be linked/unlinked at any time
  - Duplicating preserves most settings but creates a fresh work order
*/

-- Trigger to automatically update is_billable when work order type changes
CREATE OR REPLACE FUNCTION auto_update_billable_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If type changed to service, set is_billable to true
  IF NEW.type = 'service' AND (OLD.type IS NULL OR OLD.type != 'service') THEN
    NEW.is_billable := true;
  END IF;

  -- If type changed from service to something else, set is_billable to false
  -- (unless manually overridden by user in the same update)
  IF NEW.type != 'service' AND OLD.type = 'service' THEN
    -- Only auto-set to false if is_billable wasn't explicitly changed in this update
    IF NEW.is_billable = OLD.is_billable THEN
      NEW.is_billable := false;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on work_orders table
DROP TRIGGER IF EXISTS trigger_auto_update_billable_status ON work_orders;
CREATE TRIGGER trigger_auto_update_billable_status
  BEFORE UPDATE OF type ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_billable_status();

-- Function to link multiple work orders together
CREATE OR REPLACE FUNCTION link_work_orders(
  p_work_order_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
  v_existing_group_id uuid;
  v_wo_id uuid;
BEGIN
  -- Check if any of the work orders already has a group_id
  SELECT work_order_group_id INTO v_existing_group_id
  FROM work_orders
  WHERE id = ANY(p_work_order_ids)
    AND work_order_group_id IS NOT NULL
  LIMIT 1;

  -- Use existing group_id or create a new one
  v_group_id := COALESCE(v_existing_group_id, gen_random_uuid());

  -- Update all work orders to use this group_id
  UPDATE work_orders
  SET work_order_group_id = v_group_id
  WHERE id = ANY(p_work_order_ids);

  RETURN v_group_id;
END;
$$;

-- Function to unlink a work order from its group
CREATE OR REPLACE FUNCTION unlink_work_order(
  p_work_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE work_orders
  SET work_order_group_id = NULL
  WHERE id = p_work_order_id;
END;
$$;

-- Function to duplicate a work order to another technician with automatic linking
CREATE OR REPLACE FUNCTION duplicate_work_order_to_technician(
  p_source_work_order_id uuid,
  p_target_technician_id uuid,
  p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_wo work_orders%ROWTYPE;
  v_new_wo_id uuid;
  v_group_id uuid;
BEGIN
  -- Get the source work order
  SELECT * INTO v_source_wo
  FROM work_orders
  WHERE id = p_source_work_order_id;

  IF v_source_wo IS NULL THEN
    RAISE EXCEPTION 'Source work order not found';
  END IF;

  -- Generate new ID
  v_new_wo_id := gen_random_uuid();

  -- Determine group_id for linking
  IF v_source_wo.work_order_group_id IS NOT NULL THEN
    -- Use existing group_id
    v_group_id := v_source_wo.work_order_group_id;
  ELSE
    -- Create a new group_id and update source work order
    v_group_id := gen_random_uuid();
    UPDATE work_orders
    SET work_order_group_id = v_group_id
    WHERE id = p_source_work_order_id;
  END IF;

  -- Create the duplicate work order
  INSERT INTO work_orders (
    id,
    company_id,
    contact_id,
    project_id,
    work_order_group_id,
    title,
    description,
    type,
    is_billable,
    billable_type,
    warranty_reference_type,
    warranty_reference_id,
    priority,
    status,
    assigned_to,
    start_date,
    target_completion_date,
    estimated_hours,
    notes,
    internal_notes,
    send_appointment_reminder,
    reminder_email,
    reminder_sms,
    created_by,
    office_id
  ) VALUES (
    v_new_wo_id,
    v_source_wo.company_id,
    v_source_wo.contact_id,
    v_source_wo.project_id,
    v_group_id, -- Link to group
    v_source_wo.title,
    v_source_wo.description,
    v_source_wo.type,
    v_source_wo.is_billable,
    v_source_wo.billable_type,
    v_source_wo.warranty_reference_type,
    v_source_wo.warranty_reference_id,
    v_source_wo.priority,
    'assigned', -- New work order is assigned
    p_target_technician_id, -- Assign to target technician
    v_source_wo.start_date,
    v_source_wo.target_completion_date,
    v_source_wo.estimated_hours,
    v_source_wo.notes,
    v_source_wo.internal_notes,
    v_source_wo.send_appointment_reminder,
    v_source_wo.reminder_email,
    v_source_wo.reminder_sms,
    p_user_id,
    v_source_wo.office_id
  );

  RETURN v_new_wo_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION link_work_orders TO authenticated;
GRANT EXECUTE ON FUNCTION unlink_work_order TO authenticated;
GRANT EXECUTE ON FUNCTION duplicate_work_order_to_technician TO authenticated;
