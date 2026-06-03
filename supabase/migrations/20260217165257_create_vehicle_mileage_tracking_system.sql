-- Create Vehicle Mileage Tracking System
-- This migration creates a comprehensive vehicle mileage tracking system with quarterly reminders.

-- Create vehicles table
CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  office_id uuid REFERENCES company_offices(id) ON DELETE SET NULL,
  make text NOT NULL,
  model text NOT NULL,
  year integer NOT NULL CHECK (year >= 1900 AND year <= 2100),
  vin text,
  license_plate text NOT NULL,
  color text,
  initial_mileage integer NOT NULL DEFAULT 0 CHECK (initial_mileage >= 0),
  purchase_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'retired')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create vehicle assignments table
CREATE TABLE IF NOT EXISTS vehicle_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_date_range CHECK (end_date IS NULL OR end_date >= assigned_date)
);

-- Create mileage entries table
CREATE TABLE IF NOT EXISTS mileage_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  odometer_reading integer NOT NULL CHECK (odometer_reading >= 0),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  photo_url text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create mileage reminders table
CREATE TABLE IF NOT EXISTS mileage_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  reminder_sent_at timestamptz,
  entry_submitted_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'completed', 'overdue')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_vehicles_organization_id ON vehicles(organization_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_office_id ON vehicles(office_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);

CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_vehicle_id ON vehicle_assignments(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_user_id ON vehicle_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_is_active ON vehicle_assignments(is_active);

CREATE INDEX IF NOT EXISTS idx_mileage_entries_vehicle_id ON mileage_entries(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_mileage_entries_user_id ON mileage_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_mileage_entries_entry_date ON mileage_entries(entry_date);

CREATE INDEX IF NOT EXISTS idx_mileage_reminders_user_id ON mileage_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_mileage_reminders_vehicle_id ON mileage_reminders(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_mileage_reminders_due_date ON mileage_reminders(due_date);
CREATE INDEX IF NOT EXISTS idx_mileage_reminders_status ON mileage_reminders(status);

-- Enable Row Level Security
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mileage_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE mileage_reminders ENABLE ROW LEVEL SECURITY;

-- RLS Policies for vehicles table
CREATE POLICY "Users can view vehicles in their organization"
  ON vehicles FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins and managers can insert vehicles"
  ON vehicles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Admins and managers can update vehicles"
  ON vehicles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Admins can delete vehicles"
  ON vehicles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

-- RLS Policies for vehicle_assignments table
CREATE POLICY "Users can view their vehicle assignments"
  ON vehicle_assignments FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Admins and managers can manage vehicle assignments"
  ON vehicle_assignments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  );

-- RLS Policies for mileage_entries table
CREATE POLICY "Users can view their mileage entries"
  ON mileage_entries FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Users can insert their own mileage entries"
  ON mileage_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM vehicle_assignments
      WHERE vehicle_id = mileage_entries.vehicle_id
      AND user_id = auth.uid()
      AND is_active = true
    )
  );

CREATE POLICY "Users can update their own mileage entries"
  ON mileage_entries FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can delete mileage entries"
  ON mileage_entries FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

-- RLS Policies for mileage_reminders table
CREATE POLICY "Users can view their reminders"
  ON mileage_reminders FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "System can manage reminders"
  ON mileage_reminders FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Function to get users needing mileage reminders
CREATE OR REPLACE FUNCTION get_users_needing_mileage_reminders()
RETURNS TABLE (
  user_id uuid,
  vehicle_id uuid,
  vehicle_info text,
  last_entry_date date,
  days_since_last_entry integer
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH active_assignments AS (
    SELECT 
      va.user_id,
      va.vehicle_id,
      v.make || ' ' || v.model || ' (' || v.license_plate || ')' as vehicle_info
    FROM vehicle_assignments va
    JOIN vehicles v ON v.id = va.vehicle_id
    WHERE va.is_active = true
    AND v.status = 'active'
  ),
  last_entries AS (
    SELECT 
      me.vehicle_id,
      me.user_id,
      MAX(me.entry_date) as last_entry_date
    FROM mileage_entries me
    GROUP BY me.vehicle_id, me.user_id
  )
  SELECT 
    aa.user_id,
    aa.vehicle_id,
    aa.vehicle_info,
    COALESCE(le.last_entry_date, (SELECT assigned_date FROM vehicle_assignments WHERE id = (
      SELECT id FROM vehicle_assignments 
      WHERE vehicle_id = aa.vehicle_id 
      AND user_id = aa.user_id 
      AND is_active = true 
      LIMIT 1
    ))) as last_entry_date,
    CURRENT_DATE - COALESCE(le.last_entry_date, (SELECT assigned_date FROM vehicle_assignments WHERE id = (
      SELECT id FROM vehicle_assignments 
      WHERE vehicle_id = aa.vehicle_id 
      AND user_id = aa.user_id 
      AND is_active = true 
      LIMIT 1
    ))) as days_since_last_entry
  FROM active_assignments aa
  LEFT JOIN last_entries le ON le.vehicle_id = aa.vehicle_id AND le.user_id = aa.user_id
  WHERE CURRENT_DATE - COALESCE(le.last_entry_date, (SELECT assigned_date FROM vehicle_assignments WHERE id = (
    SELECT id FROM vehicle_assignments 
    WHERE vehicle_id = aa.vehicle_id 
    AND user_id = aa.user_id 
    AND is_active = true 
    LIMIT 1
  ))) >= 90;
END;
$$;

-- Function to create next mileage reminder
CREATE OR REPLACE FUNCTION create_next_mileage_reminder(p_user_id uuid, p_vehicle_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_entry_date date;
  v_next_due_date date;
BEGIN
  -- Get the last mileage entry date
  SELECT MAX(entry_date) INTO v_last_entry_date
  FROM mileage_entries
  WHERE user_id = p_user_id
  AND vehicle_id = p_vehicle_id;
  
  -- If no entry exists, use assignment date
  IF v_last_entry_date IS NULL THEN
    SELECT assigned_date INTO v_last_entry_date
    FROM vehicle_assignments
    WHERE user_id = p_user_id
    AND vehicle_id = p_vehicle_id
    AND is_active = true
    LIMIT 1;
  END IF;
  
  -- Calculate next due date (3 months from last entry)
  v_next_due_date := v_last_entry_date + INTERVAL '3 months';
  
  -- Create reminder if it doesn't exist
  INSERT INTO mileage_reminders (user_id, vehicle_id, due_date, status)
  VALUES (p_user_id, p_vehicle_id, v_next_due_date, 'pending')
  ON CONFLICT DO NOTHING;
END;
$$;

-- Function to get vehicle statistics
CREATE OR REPLACE FUNCTION get_vehicle_statistics(p_vehicle_id uuid)
RETURNS TABLE (
  total_entries integer,
  total_miles_recorded integer,
  average_miles_per_quarter numeric,
  last_entry_date date,
  last_odometer_reading integer
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH entries AS (
    SELECT 
      COUNT(*) as entry_count,
      MAX(odometer_reading) - MIN(odometer_reading) as miles_driven,
      MAX(entry_date) as last_date,
      MAX(odometer_reading) as last_reading
    FROM mileage_entries
    WHERE vehicle_id = p_vehicle_id
  )
  SELECT 
    COALESCE(entry_count::integer, 0),
    COALESCE(miles_driven::integer, 0),
    CASE 
      WHEN entry_count > 1 THEN 
        ROUND(miles_driven::numeric / GREATEST(entry_count - 1, 1), 2)
      ELSE 0
    END as avg_per_quarter,
    last_date,
    last_reading::integer
  FROM entries;
END;
$$;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_vehicle_updated_at()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_vehicles_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW
  EXECUTE FUNCTION update_vehicle_updated_at();

CREATE TRIGGER trigger_update_vehicle_assignments_updated_at
  BEFORE UPDATE ON vehicle_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_vehicle_updated_at();

CREATE TRIGGER trigger_update_mileage_entries_updated_at
  BEFORE UPDATE ON mileage_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_vehicle_updated_at();

CREATE TRIGGER trigger_update_mileage_reminders_updated_at
  BEFORE UPDATE ON mileage_reminders
  FOR EACH ROW
  EXECUTE FUNCTION update_vehicle_updated_at();

-- Trigger to create initial reminder when vehicle is assigned
CREATE OR REPLACE FUNCTION create_initial_mileage_reminder()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_active = true THEN
    INSERT INTO mileage_reminders (user_id, vehicle_id, due_date, status)
    VALUES (NEW.user_id, NEW.vehicle_id, NEW.assigned_date + INTERVAL '3 months', 'pending')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_create_initial_reminder
  AFTER INSERT ON vehicle_assignments
  FOR EACH ROW
  EXECUTE FUNCTION create_initial_mileage_reminder();

-- Trigger to create notification and next reminder when mileage is submitted
CREATE OR REPLACE FUNCTION handle_mileage_entry_submission()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_vehicle_info text;
BEGIN
  -- Get vehicle information
  SELECT make || ' ' || model || ' (' || license_plate || ')'
  INTO v_vehicle_info
  FROM vehicles
  WHERE id = NEW.vehicle_id;
  
  -- Mark existing reminders as completed
  UPDATE mileage_reminders
  SET status = 'completed',
      entry_submitted_at = now()
  WHERE user_id = NEW.user_id
  AND vehicle_id = NEW.vehicle_id
  AND status IN ('pending', 'sent', 'overdue');
  
  -- Create next reminder
  PERFORM create_next_mileage_reminder(NEW.user_id, NEW.vehicle_id);
  
  -- Create notification for admins
  INSERT INTO notifications (user_id, type, title, body, reference_id, reference_type)
  SELECT 
    p.id,
    'system',
    'Mileage Entry Submitted',
    (SELECT full_name FROM profiles WHERE id = NEW.user_id) || ' submitted mileage for ' || v_vehicle_info,
    NEW.id::text,
    'mileage_entry'
  FROM profiles p
  WHERE p.role IN ('admin', 'manager');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_handle_mileage_submission
  AFTER INSERT ON mileage_entries
  FOR EACH ROW
  EXECUTE FUNCTION handle_mileage_entry_submission();