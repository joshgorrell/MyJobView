/*
  # GPS Breadcrumbs & Travel Bonus System

  1. New Tables
    - `gps_breadcrumbs`
      - `id` (uuid, primary key)
      - `technician_id` (uuid, references profiles)
      - `daily_clock_entry_id` (uuid, references daily_clock_entries, nullable)
      - `work_order_id` (uuid, references work_orders, nullable)
      - `latitude` (decimal) - GPS latitude
      - `longitude` (decimal) - GPS longitude
      - `accuracy` (decimal) - GPS accuracy in meters
      - `speed` (decimal, nullable) - Speed in m/s
      - `heading` (decimal, nullable) - Direction in degrees
      - `recorded_at` (timestamptz) - When GPS point was captured
      - `synced_at` (timestamptz) - When uploaded to server (for offline tracking)
      - `created_at` (timestamptz)

    - `office_travel_settings`
      - `id` (uuid, primary key)
      - `office_id` (uuid, references company_offices)
      - `radius_miles` (decimal) - Radius bubble around office
      - `default_rate_per_mile` (decimal) - Default travel bonus rate
      - `calculation_method` (text) - round_trip, one_way
      - `auto_approve_under_amount` (decimal, nullable) - Auto-approve if under this amount
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `travel_bonus_requests`
      - `id` (uuid, primary key)
      - `technician_id` (uuid, references profiles)
      - `work_order_id` (uuid, references work_orders)
      - `daily_clock_entry_id` (uuid, references daily_clock_entries, nullable)
      - `office_id` (uuid, references company_offices)
      - `job_address` (text) - Job site address
      - `job_latitude` (decimal) - Job site latitude
      - `job_longitude` (decimal) - Job site longitude
      - `office_latitude` (decimal) - Office latitude
      - `office_longitude` (decimal) - Office longitude
      - `total_distance_miles` (decimal) - Total distance calculated
      - `eligible_miles` (decimal) - Miles outside radius bubble
      - `rate_per_mile` (decimal) - Rate used for calculation
      - `bonus_amount` (decimal) - Calculated bonus amount
      - `calculation_method` (text) - round_trip, one_way
      - `status` (text) - pending, approved, denied, adjusted
      - `approved_by` (uuid, references profiles, nullable)
      - `approved_at` (timestamptz, nullable)
      - `approval_notes` (text, nullable)
      - `adjusted_amount` (decimal, nullable) - If admin adjusted the amount
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Techs can create GPS breadcrumbs
    - Only admins can view all breadcrumbs
    - Techs can view their own travel bonus requests
    - Only admins/managers can approve/deny requests

  3. Important Notes
    - GPS breadcrumbs are collected during clocked-in time only
    - Travel bonus is auto-calculated when job clock-out occurs
    - Uses Google Maps API for route distance (not actual driven route)
    - Only miles outside the office radius bubble count toward bonus
    - Admin must approve before bonus is added to payroll
*/

-- Create gps_breadcrumbs table
CREATE TABLE IF NOT EXISTS gps_breadcrumbs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid REFERENCES profiles(id) NOT NULL,
  daily_clock_entry_id uuid REFERENCES daily_clock_entries(id) ON DELETE CASCADE,
  work_order_id uuid REFERENCES work_orders(id) ON DELETE CASCADE,
  latitude decimal(10, 8) NOT NULL,
  longitude decimal(11, 8) NOT NULL,
  accuracy decimal(10, 2),
  speed decimal(10, 2),
  heading decimal(5, 2),
  recorded_at timestamptz NOT NULL,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gps_technician ON gps_breadcrumbs(technician_id);
CREATE INDEX IF NOT EXISTS idx_gps_recorded_at ON gps_breadcrumbs(recorded_at);
CREATE INDEX IF NOT EXISTS idx_gps_daily_entry ON gps_breadcrumbs(daily_clock_entry_id);
CREATE INDEX IF NOT EXISTS idx_gps_work_order ON gps_breadcrumbs(work_order_id);
CREATE INDEX IF NOT EXISTS idx_gps_location ON gps_breadcrumbs(latitude, longitude);

-- Create office_travel_settings table
CREATE TABLE IF NOT EXISTS office_travel_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id uuid REFERENCES company_offices(id) UNIQUE NOT NULL,
  radius_miles decimal(10, 2) DEFAULT 15.0,
  default_rate_per_mile decimal(10, 2) DEFAULT 0.50,
  calculation_method text DEFAULT 'round_trip' CHECK (calculation_method IN ('round_trip', 'one_way')),
  auto_approve_under_amount decimal(10, 2),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_travel_settings_office ON office_travel_settings(office_id);

-- Create travel_bonus_requests table
CREATE TABLE IF NOT EXISTS travel_bonus_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid REFERENCES profiles(id) NOT NULL,
  work_order_id uuid REFERENCES work_orders(id) NOT NULL,
  daily_clock_entry_id uuid REFERENCES daily_clock_entries(id) ON DELETE SET NULL,
  office_id uuid REFERENCES company_offices(id) NOT NULL,
  job_address text NOT NULL,
  job_latitude decimal(10, 8),
  job_longitude decimal(11, 8),
  office_latitude decimal(10, 8) NOT NULL,
  office_longitude decimal(11, 8) NOT NULL,
  total_distance_miles decimal(10, 2) NOT NULL,
  eligible_miles decimal(10, 2) NOT NULL,
  rate_per_mile decimal(10, 2) NOT NULL,
  bonus_amount decimal(10, 2) NOT NULL,
  calculation_method text NOT NULL CHECK (calculation_method IN ('round_trip', 'one_way')),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'adjusted', 'paid')),
  approved_by uuid REFERENCES profiles(id),
  approved_at timestamptz,
  approval_notes text,
  adjusted_amount decimal(10, 2),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_travel_bonus_tech ON travel_bonus_requests(technician_id);
CREATE INDEX IF NOT EXISTS idx_travel_bonus_status ON travel_bonus_requests(status);
CREATE INDEX IF NOT EXISTS idx_travel_bonus_work_order ON travel_bonus_requests(work_order_id);
CREATE INDEX IF NOT EXISTS idx_travel_bonus_office ON travel_bonus_requests(office_id);
CREATE INDEX IF NOT EXISTS idx_travel_bonus_created ON travel_bonus_requests(created_at);

-- Enable RLS
ALTER TABLE gps_breadcrumbs ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_travel_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_bonus_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for gps_breadcrumbs

-- Techs can create their own breadcrumbs
CREATE POLICY "Techs can create own GPS breadcrumbs"
  ON gps_breadcrumbs FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = technician_id
  );

-- Techs can view their own breadcrumbs
CREATE POLICY "Techs can view own GPS breadcrumbs"
  ON gps_breadcrumbs FOR SELECT
  TO authenticated
  USING (
    auth.uid() = technician_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'dispatch')
    )
  );

-- Admins can view all breadcrumbs
CREATE POLICY "Admins can view all GPS breadcrumbs"
  ON gps_breadcrumbs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'dispatch')
    )
  );

-- RLS Policies for office_travel_settings

-- Admins can manage travel settings
CREATE POLICY "Admins can view travel settings"
  ON office_travel_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager')
    )
  );

CREATE POLICY "Admins can insert travel settings"
  ON office_travel_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update travel settings"
  ON office_travel_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- RLS Policies for travel_bonus_requests

-- Techs can view their own requests
CREATE POLICY "Techs can view own travel bonus requests"
  ON travel_bonus_requests FOR SELECT
  TO authenticated
  USING (
    auth.uid() = technician_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'dispatch')
    )
  );

-- System can create travel bonus requests (via function)
CREATE POLICY "System can create travel bonus requests"
  ON travel_bonus_requests FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Admins can update requests (approve/deny)
CREATE POLICY "Admins can update travel bonus requests"
  ON travel_bonus_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager')
    )
  );

-- Function to calculate distance between two GPS coordinates (Haversine formula)
CREATE OR REPLACE FUNCTION calculate_distance_miles(
  lat1 decimal,
  lon1 decimal,
  lat2 decimal,
  lon2 decimal
)
RETURNS decimal AS $$
DECLARE
  earth_radius decimal := 3958.8; -- Earth's radius in miles
  dlat decimal;
  dlon decimal;
  a decimal;
  c decimal;
BEGIN
  dlat := radians(lat2 - lat1);
  dlon := radians(lon2 - lon1);
  
  a := sin(dlat/2) * sin(dlat/2) + 
       cos(radians(lat1)) * cos(radians(lat2)) * 
       sin(dlon/2) * sin(dlon/2);
  
  c := 2 * atan2(sqrt(a), sqrt(1-a));
  
  RETURN earth_radius * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to create travel bonus request when work order is completed
CREATE OR REPLACE FUNCTION create_travel_bonus_request()
RETURNS TRIGGER AS $$
DECLARE
  v_tech_record RECORD;
  v_office_settings RECORD;
  v_office_location RECORD;
  v_work_order RECORD;
  v_distance_miles decimal;
  v_eligible_miles decimal;
  v_bonus_amount decimal;
  v_rate decimal;
  v_method text;
  v_daily_clock_id uuid;
BEGIN
  -- Only process when time entry is completed (has clock_out)
  IF NEW.clock_out IS NULL OR OLD.clock_out IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Get tech record with travel bonus settings
  SELECT * INTO v_tech_record
  FROM profiles
  WHERE id = NEW.technician_id
  AND travel_bonus_enabled = true;

  -- If tech doesn't have travel bonus enabled, skip
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Get work order details
  SELECT * INTO v_work_order
  FROM work_orders
  WHERE id = NEW.work_order_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Get office location
  SELECT 
    co.id,
    COALESCE(co.latitude, 0) as latitude,
    COALESCE(co.longitude, 0) as longitude
  INTO v_office_location
  FROM company_offices co
  WHERE co.id = COALESCE(v_tech_record.primary_office_id, v_work_order.office_id);

  IF NOT FOUND OR v_office_location.latitude = 0 OR v_office_location.longitude = 0 THEN
    RETURN NEW; -- Can't calculate without office coordinates
  END IF;

  -- Get office travel settings
  SELECT * INTO v_office_settings
  FROM office_travel_settings
  WHERE office_id = v_office_location.id;

  -- If no settings exist, create defaults
  IF NOT FOUND THEN
    INSERT INTO office_travel_settings (office_id)
    VALUES (v_office_location.id)
    RETURNING * INTO v_office_settings;
  END IF;

  -- Use tech's rate if set, otherwise use office default
  v_rate := COALESCE(v_tech_record.travel_bonus_rate, v_office_settings.default_rate_per_mile, 0.50);
  v_method := COALESCE(v_tech_record.travel_bonus_method, v_office_settings.calculation_method, 'round_trip');

  -- Calculate distance from office to job site
  v_distance_miles := calculate_distance_miles(
    v_office_location.latitude,
    v_office_location.longitude,
    COALESCE(v_work_order.latitude, 0),
    COALESCE(v_work_order.longitude, 0)
  );

  -- Skip if we don't have job coordinates
  IF v_distance_miles = 0 THEN
    RETURN NEW;
  END IF;

  -- If round trip, double the distance
  IF v_method = 'round_trip' THEN
    v_distance_miles := v_distance_miles * 2;
  END IF;

  -- Calculate eligible miles (only miles outside radius bubble)
  IF v_method = 'round_trip' THEN
    -- For round trip, subtract radius from each direction
    v_eligible_miles := GREATEST(0, v_distance_miles - (v_office_settings.radius_miles * 2));
  ELSE
    -- For one way, subtract radius once
    v_eligible_miles := GREATEST(0, v_distance_miles - v_office_settings.radius_miles);
  END IF;

  -- Calculate bonus amount
  v_bonus_amount := v_eligible_miles * v_rate;

  -- Only create request if there are eligible miles
  IF v_eligible_miles > 0 AND v_bonus_amount > 0 THEN
    -- Get today's daily clock entry for the tech
    SELECT id INTO v_daily_clock_id
    FROM daily_clock_entries
    WHERE technician_id = NEW.technician_id
    AND entry_date = CURRENT_DATE
    LIMIT 1;

    -- Create travel bonus request
    INSERT INTO travel_bonus_requests (
      technician_id,
      work_order_id,
      daily_clock_entry_id,
      office_id,
      job_address,
      job_latitude,
      job_longitude,
      office_latitude,
      office_longitude,
      total_distance_miles,
      eligible_miles,
      rate_per_mile,
      bonus_amount,
      calculation_method,
      status
    ) VALUES (
      NEW.technician_id,
      NEW.work_order_id,
      v_daily_clock_id,
      v_office_location.id,
      COALESCE(v_work_order.address, 'Unknown'),
      v_work_order.latitude,
      v_work_order.longitude,
      v_office_location.latitude,
      v_office_location.longitude,
      v_distance_miles,
      v_eligible_miles,
      v_rate,
      v_bonus_amount,
      v_method,
      CASE 
        WHEN v_office_settings.auto_approve_under_amount IS NOT NULL 
          AND v_bonus_amount <= v_office_settings.auto_approve_under_amount 
        THEN 'approved'
        ELSE 'pending'
      END
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate travel bonus requests
DROP TRIGGER IF EXISTS trigger_create_travel_bonus ON time_entries;
CREATE TRIGGER trigger_create_travel_bonus
  AFTER UPDATE ON time_entries
  FOR EACH ROW
  EXECUTE FUNCTION create_travel_bonus_request();

-- Function to update travel bonus request timestamp
CREATE OR REPLACE FUNCTION update_travel_bonus_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_travel_bonus_timestamp
  BEFORE UPDATE ON travel_bonus_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_travel_bonus_timestamp();

-- Add latitude/longitude to work_orders if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_orders' AND column_name = 'latitude'
  ) THEN
    ALTER TABLE work_orders ADD COLUMN latitude decimal(10, 8);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_orders' AND column_name = 'longitude'
  ) THEN
    ALTER TABLE work_orders ADD COLUMN longitude decimal(11, 8);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_orders' AND column_name = 'address'
  ) THEN
    ALTER TABLE work_orders ADD COLUMN address text;
  END IF;
END $$;

-- Add latitude/longitude to company_offices if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_offices' AND column_name = 'latitude'
  ) THEN
    ALTER TABLE company_offices ADD COLUMN latitude decimal(10, 8);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_offices' AND column_name = 'longitude'
  ) THEN
    ALTER TABLE company_offices ADD COLUMN longitude decimal(11, 8);
  END IF;
END $$;
