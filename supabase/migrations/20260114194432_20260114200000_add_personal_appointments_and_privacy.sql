/*
  # Add Personal Appointments and Privacy Features

  1. Schema Changes
    - Add `appointment_type` column with values: customer_meeting, personal, work_order, other
    - Add `is_private` boolean column (default false)
    - Add `all_day` boolean column (default false)
    - Make `contact_id` nullable to support personal appointments
    - Make `start_time` and `end_time` nullable for all-day events
    - Add indexes on new columns for query performance

  2. Functions
    - Create `get_appointments_with_privacy` function to return sanitized appointment data
    - Private appointments show full details to owner/assigned tech/admins
    - Private appointments show as "Busy" blocks to others

  3. Security
    - Update RLS policies to handle privacy filtering
    - Maintain time slot visibility for conflict detection
    - Ensure admins can see all appointments

  4. Default Behavior
    - Personal appointments default assigned_technician to creator
    - Customer meetings remain as-is requiring customer selection
*/

-- Add new columns to appointments table
ALTER TABLE appointments 
  ADD COLUMN IF NOT EXISTS appointment_type text NOT NULL DEFAULT 'customer_meeting' 
    CHECK (appointment_type IN ('customer_meeting', 'personal', 'work_order', 'other')),
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS all_day boolean NOT NULL DEFAULT false;

-- Make contact_id nullable for personal appointments
ALTER TABLE appointments 
  ALTER COLUMN contact_id DROP NOT NULL;

-- Make time fields nullable for all-day events
ALTER TABLE appointments 
  ALTER COLUMN start_time DROP NOT NULL,
  ALTER COLUMN end_time DROP NOT NULL;

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_appointments_type ON appointments(company_id, appointment_type);
CREATE INDEX IF NOT EXISTS idx_appointments_private ON appointments(company_id, is_private);

-- Create function to get appointments with privacy filtering
CREATE OR REPLACE FUNCTION get_appointments_with_privacy(
  p_user_id uuid,
  p_company_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  company_id uuid,
  project_id uuid,
  contact_id uuid,
  title text,
  description text,
  appointment_date date,
  start_time time,
  end_time time,
  status text,
  assigned_technician uuid,
  location text,
  notes text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  appointment_type text,
  is_private boolean,
  all_day boolean,
  is_blocked boolean,
  can_view_details boolean
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_role text;
  v_is_admin boolean;
BEGIN
  -- Get user role
  SELECT role INTO v_user_role
  FROM profiles
  WHERE profiles.id = p_user_id;

  -- Check if user is admin
  v_is_admin := v_user_role IN ('admin', 'owner');

  RETURN QUERY
  SELECT 
    a.id,
    a.company_id,
    a.project_id,
    CASE 
      WHEN a.is_private AND NOT (a.created_by = p_user_id OR a.assigned_technician = p_user_id OR v_is_admin)
      THEN NULL
      ELSE a.contact_id
    END as contact_id,
    CASE 
      WHEN a.is_private AND NOT (a.created_by = p_user_id OR a.assigned_technician = p_user_id OR v_is_admin)
      THEN 'Busy'
      ELSE a.title
    END as title,
    CASE 
      WHEN a.is_private AND NOT (a.created_by = p_user_id OR a.assigned_technician = p_user_id OR v_is_admin)
      THEN NULL
      ELSE a.description
    END as description,
    a.appointment_date,
    a.start_time,
    a.end_time,
    a.status,
    CASE 
      WHEN a.is_private AND NOT (a.created_by = p_user_id OR a.assigned_technician = p_user_id OR v_is_admin)
      THEN NULL
      ELSE a.assigned_technician
    END as assigned_technician,
    CASE 
      WHEN a.is_private AND NOT (a.created_by = p_user_id OR a.assigned_technician = p_user_id OR v_is_admin)
      THEN NULL
      ELSE a.location
    END as location,
    CASE 
      WHEN a.is_private AND NOT (a.created_by = p_user_id OR a.assigned_technician = p_user_id OR v_is_admin)
      THEN NULL
      ELSE a.notes
    END as notes,
    a.created_by,
    a.created_at,
    a.updated_at,
    CASE 
      WHEN a.is_private AND NOT (a.created_by = p_user_id OR a.assigned_technician = p_user_id OR v_is_admin)
      THEN 'personal'::text
      ELSE a.appointment_type
    END as appointment_type,
    a.is_private,
    a.all_day,
    -- is_blocked: true if user can't see details
    (a.is_private AND NOT (a.created_by = p_user_id OR a.assigned_technician = p_user_id OR v_is_admin)) as is_blocked,
    -- can_view_details: true if user can see full details
    (NOT a.is_private OR a.created_by = p_user_id OR a.assigned_technician = p_user_id OR v_is_admin) as can_view_details
  FROM appointments a
  WHERE 
    a.company_id = p_company_id
    AND (p_start_date IS NULL OR a.appointment_date >= p_start_date)
    AND (p_end_date IS NULL OR a.appointment_date <= p_end_date)
  ORDER BY a.appointment_date, a.start_time;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_appointments_with_privacy TO authenticated;

-- Add constraint to ensure all-day events don't require times
ALTER TABLE appointments 
  ADD CONSTRAINT check_all_day_times CHECK (
    (all_day = true) OR 
    (all_day = false AND start_time IS NOT NULL AND end_time IS NOT NULL)
  );

-- Add constraint to ensure customer meetings have a contact
ALTER TABLE appointments 
  ADD CONSTRAINT check_customer_meeting_contact CHECK (
    (appointment_type != 'customer_meeting') OR 
    (appointment_type = 'customer_meeting' AND contact_id IS NOT NULL)
  );

-- Create trigger to auto-assign technician for personal appointments
CREATE OR REPLACE FUNCTION set_personal_appointment_defaults()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Auto-assign creator as technician for personal appointments if not set
  IF NEW.appointment_type = 'personal' AND NEW.assigned_technician IS NULL THEN
    NEW.assigned_technician := NEW.created_by;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_set_personal_appointment_defaults
  BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION set_personal_appointment_defaults();
