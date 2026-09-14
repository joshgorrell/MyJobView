-- Scheduling permission enforcement triggers
-- Allows only admin, manager, service_manager roles to modify scheduling columns
-- SECURITY DEFINER functions bypass via app.bypass_scheduling_guard setting

-- Work Orders: trigger to protect scheduling columns
CREATE OR REPLACE FUNCTION enforce_work_order_scheduling_permissions()
RETURNS TRIGGER AS $$
DECLARE
  caller_role TEXT;
  bypass_guard TEXT;
BEGIN
  -- Check if bypass is set (used by SECURITY DEFINER functions)
  bypass_guard := current_setting('app.bypass_scheduling_guard', true);
  IF bypass_guard = 'true' THEN
    RETURN NEW;
  END IF;

  -- Only check if scheduling columns are actually being changed
  IF (NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date)
     OR (NEW.scheduled_start_time IS DISTINCT FROM OLD.scheduled_start_time)
     OR (NEW.scheduled_end_time IS DISTINCT FROM OLD.scheduled_end_time)
     OR (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN

    -- Get caller's role
    SELECT role INTO caller_role
    FROM profiles
    WHERE id = auth.uid();

    IF caller_role IS NULL THEN
      RAISE EXCEPTION 'Permission denied: unable to verify user role for scheduling changes';
    END IF;

    IF caller_role NOT IN ('admin', 'manager', 'service_manager') THEN
      RAISE EXCEPTION 'Permission denied: only admin, manager, or service_manager can modify scheduling fields';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Appointments: trigger to protect scheduling columns
CREATE OR REPLACE FUNCTION enforce_appointment_scheduling_permissions()
RETURNS TRIGGER AS $$
DECLARE
  caller_role TEXT;
  bypass_guard TEXT;
BEGIN
  bypass_guard := current_setting('app.bypass_scheduling_guard', true);
  IF bypass_guard = 'true' THEN
    RETURN NEW;
  END IF;

  IF (NEW.appointment_date IS DISTINCT FROM OLD.appointment_date)
     OR (NEW.start_time IS DISTINCT FROM OLD.start_time)
     OR (NEW.end_time IS DISTINCT FROM OLD.end_time)
     OR (NEW.assigned_technician IS DISTINCT FROM OLD.assigned_technician) THEN

    SELECT role INTO caller_role
    FROM profiles
    WHERE id = auth.uid();

    IF caller_role IS NULL THEN
      RAISE EXCEPTION 'Permission denied: unable to verify user role for scheduling changes';
    END IF;

    IF caller_role NOT IN ('admin', 'manager', 'service_manager') THEN
      RAISE EXCEPTION 'Permission denied: only admin, manager, or service_manager can modify scheduling fields';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply triggers
DROP TRIGGER IF EXISTS trg_work_order_scheduling_guard ON work_orders;
CREATE TRIGGER trg_work_order_scheduling_guard
  BEFORE UPDATE ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION enforce_work_order_scheduling_permissions();

DROP TRIGGER IF EXISTS trg_appointment_scheduling_guard ON appointments;
CREATE TRIGGER trg_appointment_scheduling_guard
  BEFORE UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION enforce_appointment_scheduling_permissions();

-- SECURITY DEFINER function: reschedule work order (atomic schedule + status + assignment)
CREATE OR REPLACE FUNCTION reschedule_work_order_secure(
  p_work_order_id UUID,
  p_new_date TEXT,
  p_new_start_time TEXT,
  p_new_end_time TEXT,
  p_new_tech_id TEXT DEFAULT NULL,
  p_force BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
  caller_uid UUID := auth.uid();
  caller_role TEXT;
  current_status TEXT;
  current_tech TEXT;
  conflict_count INT := 0;
  conflict_data JSONB;
BEGIN
  -- Verify caller role
  SELECT role INTO caller_role FROM profiles WHERE id = caller_uid;
  IF caller_role IS NULL OR caller_role NOT IN ('admin', 'manager', 'service_manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: insufficient role for scheduling');
  END IF;

  -- Get current status and technician
  SELECT status, assigned_to INTO current_status, current_tech
  FROM work_orders WHERE id = p_work_order_id;

  IF current_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Work order not found');
  END IF;

  -- Server-side conflict check (unless force)
  IF NOT p_force THEN
    SELECT count(*) INTO conflict_count
    FROM (
      SELECT 1 FROM appointments a
      WHERE a.appointment_date = p_new_date
        AND a.assigned_technician = COALESCE(p_new_tech_id, current_tech)
        AND a.status <> 'cancelled'
        AND a.id <> p_work_order_id
        AND to_minutes(a.start_time) < to_minutes(p_new_end_time)
        AND to_minutes(a.end_time) > to_minutes(p_new_start_time)
      UNION ALL
      SELECT 1 FROM work_orders w
      WHERE w.scheduled_date = p_new_date
        AND w.assigned_to = COALESCE(p_new_tech_id, current_tech)
        AND w.status NOT IN ('completed', 'cancelled', 'archived')
        AND w.id <> p_work_order_id
        AND to_minutes(COALESCE(w.scheduled_start_time, '08:00')) < to_minutes(p_new_end_time)
        AND to_minutes(COALESCE(w.scheduled_end_time, '17:00')) > to_minutes(p_new_start_time)
    ) AS conflicts;

    IF conflict_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'conflict', jsonb_build_object('hasConflict', true));
    END IF;
  END IF;

  -- Determine status transition
  -- Only transition if current status is 'pending' and a technician is being assigned
  -- Never downgrade in_progress, completed, cancelled, etc.
  DECLARE
    new_status TEXT := current_status;
  BEGIN
    IF p_new_tech_id IS NOT NULL AND p_new_tech_id <> '' THEN
      -- Assigning to a technician
      IF current_status = 'pending' THEN
        new_status := 'scheduled';
      END IF;
    ELSE
      -- Unassigning: only transition if currently assigned/scheduled
      IF current_status IN ('assigned', 'scheduled') THEN
        new_status := 'pending';
      END IF;
    END IF;
  END;

  -- Perform the update with bypass guard
  PERFORM set_config('app.bypass_scheduling_guard', 'true', false);

  UPDATE work_orders
  SET scheduled_date = p_new_date,
      scheduled_start_time = p_new_start_time,
      scheduled_end_time = p_new_end_time,
      assigned_to = CASE
        WHEN p_new_tech_id IS NOT NULL AND p_new_tech_id <> '' THEN p_new_tech_id::UUID
        WHEN p_new_tech_id = '' THEN NULL
        ELSE assigned_to
      END,
      status = new_status
  WHERE id = p_work_order_id;

  PERFORM set_config('app.bypass_scheduling_guard', 'false', false);

  RETURN jsonb_build_object('success', true, 'new_status', new_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- SECURITY DEFINER function: reschedule appointment (atomic)
CREATE OR REPLACE FUNCTION reschedule_appointment_secure(
  p_appointment_id UUID,
  p_new_date TEXT,
  p_new_start_time TEXT,
  p_new_end_time TEXT,
  p_new_tech_id TEXT DEFAULT NULL,
  p_force BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
  caller_uid UUID := auth.uid();
  caller_role TEXT;
  current_tech TEXT;
  conflict_count INT := 0;
BEGIN
  SELECT role INTO caller_role FROM profiles WHERE id = caller_uid;
  IF caller_role IS NULL OR caller_role NOT IN ('admin', 'manager', 'service_manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: insufficient role for scheduling');
  END IF;

  SELECT assigned_technician INTO current_tech
  FROM appointments WHERE id = p_appointment_id;

  IF current_tech IS NULL AND NOT EXISTS (SELECT 1 FROM appointments WHERE id = p_appointment_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Appointment not found');
  END IF;

  -- Conflict check
  IF NOT p_force THEN
    SELECT count(*) INTO conflict_count
    FROM (
      SELECT 1 FROM appointments a
      WHERE a.appointment_date = p_new_date
        AND a.assigned_technician = COALESCE(p_new_tech_id, current_tech)
        AND a.status <> 'cancelled'
        AND a.id <> p_appointment_id
        AND to_minutes(a.start_time) < to_minutes(p_new_end_time)
        AND to_minutes(a.end_time) > to_minutes(p_new_start_time)
      UNION ALL
      SELECT 1 FROM work_orders w
      WHERE w.scheduled_date = p_new_date
        AND w.assigned_to = COALESCE(p_new_tech_id, current_tech)
        AND w.status NOT IN ('completed', 'cancelled', 'archived')
        AND to_minutes(COALESCE(w.scheduled_start_time, '08:00')) < to_minutes(p_new_end_time)
        AND to_minutes(COALESCE(w.scheduled_end_time, '17:00')) > to_minutes(p_new_start_time)
    ) AS conflicts;

    IF conflict_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'conflict', jsonb_build_object('hasConflict', true));
    END IF;
  END IF;

  PERFORM set_config('app.bypass_scheduling_guard', 'true', false);

  UPDATE appointments
  SET appointment_date = p_new_date,
      start_time = p_new_start_time,
      end_time = p_new_end_time,
      assigned_technician = CASE
        WHEN p_new_tech_id IS NOT NULL AND p_new_tech_id <> '' THEN p_new_tech_id::UUID
        WHEN p_new_tech_id = '' THEN NULL
        ELSE assigned_technician
      END
  WHERE id = p_appointment_id;

  PERFORM set_config('app.bypass_scheduling_guard', 'false', false);

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function for time-to-minutes conversion (used in conflict checks)
CREATE OR REPLACE FUNCTION to_minutes(t TEXT)
RETURNS INT AS $$
DECLARE
  h INT;
  m INT;
BEGIN
  IF t IS NULL THEN RETURN 0; END IF;
  h := split_part(t, ':', 1)::INT;
  m := split_part(t, ':', 2)::INT;
  RETURN h * 60 + m;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
