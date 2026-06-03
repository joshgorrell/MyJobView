/*
  # Create Dispatch System Schema

  ## Overview
  Creates comprehensive dispatch management system for field operations:
  - Real-time technician location tracking
  - Tech availability status management
  - Travel bonus/distance tracking
  - Crew assignments for multi-tech jobs
  - Job assignment queue

  ## New Tables
  
  ### `technician_locations`
  Real-time GPS location tracking for field technicians
  - `id` (uuid, primary key)
  - `technician_id` (uuid, foreign key to profiles)
  - `latitude` (numeric)
  - `longitude` (numeric)
  - `accuracy` (numeric) - GPS accuracy in meters
  - `heading` (numeric) - Direction of travel
  - `speed` (numeric) - Current speed
  - `timestamp` (timestamptz) - When location was recorded
  - `battery_level` (integer) - Device battery percentage
  - `is_active` (boolean) - Whether tech is currently clocked in

  ### `technician_status`
  Current availability and status of technicians
  - `id` (uuid, primary key)
  - `technician_id` (uuid, foreign key to profiles, unique)
  - `status` (text) - available, on_job, break, unavailable, off_duty
  - `current_appointment_id` (uuid, nullable)
  - `notes` (text) - Status notes
  - `clock_in_time` (timestamptz)
  - `clock_out_time` (timestamptz)
  - `updated_at` (timestamptz)

  ### `travel_logs`
  Distance and travel time tracking for bonus compensation
  - `id` (uuid, primary key)
  - `company_id` (uuid)
  - `technician_id` (uuid, foreign key to profiles)
  - `appointment_id` (uuid, foreign key to appointments)
  - `start_location` (jsonb) - {lat, lng, address}
  - `end_location` (jsonb) - {lat, lng, address}
  - `distance_miles` (numeric)
  - `travel_time_minutes` (integer)
  - `bonus_amount` (numeric) - Calculated bonus
  - `status` (text) - pending, approved, paid
  - `approved_by` (uuid, nullable)
  - `approved_at` (timestamptz, nullable)
  - `date` (date)
  - `created_at` (timestamptz)

  ### `crew_assignments`
  Multi-technician job assignments
  - `id` (uuid, primary key)
  - `company_id` (uuid)
  - `appointment_id` (uuid, foreign key to appointments)
  - `lead_technician_id` (uuid) - Primary tech
  - `helper_technician_ids` (uuid[]) - Array of helper tech IDs
  - `crew_notes` (text)
  - `created_by` (uuid)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Technicians can update their own location/status
  - Dispatchers and admins can view all data
  - Only admins/office managers can approve travel bonuses
*/

-- Create technician_locations table
CREATE TABLE IF NOT EXISTS technician_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  accuracy numeric DEFAULT 0,
  heading numeric,
  speed numeric,
  timestamp timestamptz DEFAULT now() NOT NULL,
  battery_level integer,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create index for fast location queries
CREATE INDEX IF NOT EXISTS idx_tech_locations_tech_time ON technician_locations(technician_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tech_locations_active ON technician_locations(is_active, timestamp DESC) WHERE is_active = true;

-- Create technician_status table
CREATE TABLE IF NOT EXISTS technician_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid REFERENCES profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'off_duty',
  current_appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  notes text,
  clock_in_time timestamptz,
  clock_out_time timestamptz,
  updated_at timestamptz DEFAULT now()
);

-- Constraint for valid status values
ALTER TABLE technician_status DROP CONSTRAINT IF EXISTS valid_status;
ALTER TABLE technician_status ADD CONSTRAINT valid_status 
  CHECK (status IN ('available', 'on_job', 'break', 'unavailable', 'off_duty'));

-- Create travel_logs table
CREATE TABLE IF NOT EXISTS travel_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  technician_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  start_location jsonb NOT NULL,
  end_location jsonb NOT NULL,
  distance_miles numeric NOT NULL DEFAULT 0,
  travel_time_minutes integer NOT NULL DEFAULT 0,
  bonus_amount numeric DEFAULT 0,
  status text DEFAULT 'pending',
  approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

-- Constraint for valid travel log status
ALTER TABLE travel_logs DROP CONSTRAINT IF EXISTS valid_travel_status;
ALTER TABLE travel_logs ADD CONSTRAINT valid_travel_status 
  CHECK (status IN ('pending', 'approved', 'rejected', 'paid'));

-- Create indexes for travel logs
CREATE INDEX IF NOT EXISTS idx_travel_logs_tech_date ON travel_logs(technician_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_travel_logs_status ON travel_logs(status, date DESC);

-- Create crew_assignments table
CREATE TABLE IF NOT EXISTS crew_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  appointment_id uuid REFERENCES appointments(id) ON DELETE CASCADE NOT NULL UNIQUE,
  lead_technician_id uuid REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  helper_technician_ids uuid[] DEFAULT ARRAY[]::uuid[],
  crew_notes text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for crew lookups
CREATE INDEX IF NOT EXISTS idx_crew_assignments_appointment ON crew_assignments(appointment_id);
CREATE INDEX IF NOT EXISTS idx_crew_assignments_lead_tech ON crew_assignments(lead_technician_id);

-- Enable RLS
ALTER TABLE technician_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE technician_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for technician_locations

-- Technicians can insert their own locations
CREATE POLICY "Technicians can insert own location"
  ON technician_locations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = technician_id);

-- Technicians can view their own locations
CREATE POLICY "Technicians can view own locations"
  ON technician_locations FOR SELECT
  TO authenticated
  USING (
    auth.uid() = technician_id OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager')
    )
  );

-- Admins and office managers can view all locations
CREATE POLICY "Dispatchers can view all locations"
  ON technician_locations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager')
    )
  );

-- RLS Policies for technician_status

-- Technicians can update their own status
CREATE POLICY "Technicians can manage own status"
  ON technician_status FOR ALL
  TO authenticated
  USING (auth.uid() = technician_id)
  WITH CHECK (auth.uid() = technician_id);

-- Dispatchers can view and update all statuses
CREATE POLICY "Dispatchers can manage all statuses"
  ON technician_status FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager')
    )
  );

-- RLS Policies for travel_logs

-- Technicians can view their own travel logs
CREATE POLICY "Technicians can view own travel logs"
  ON travel_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = technician_id);

-- Technicians can insert their own travel logs
CREATE POLICY "Technicians can create travel logs"
  ON travel_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = technician_id);

-- Admins and office managers can view all travel logs
CREATE POLICY "Managers can view all travel logs"
  ON travel_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager')
    )
  );

-- Admins and office managers can approve travel logs
CREATE POLICY "Managers can approve travel logs"
  ON travel_logs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager')
    )
  );

-- RLS Policies for crew_assignments

-- Anyone can view crew assignments for appointments they're involved in
CREATE POLICY "Users can view relevant crew assignments"
  ON crew_assignments FOR SELECT
  TO authenticated
  USING (
    auth.uid() = lead_technician_id OR
    auth.uid() = ANY(helper_technician_ids) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager')
    )
  );

-- Dispatchers can create and manage crew assignments
CREATE POLICY "Dispatchers can manage crew assignments"
  ON crew_assignments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager')
    )
  );
