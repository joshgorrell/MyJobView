/*
  # ETA Calculation System

  1. New Tables
    - `tech_locations` - Real-time technician GPS tracking
    - `distance_matrix_cache` - Cached distance/time calculations

  2. Functions
    - `calculate_distance_meters()` - Haversine formula
    - `estimate_travel_time()` - Time estimation
    - `get_tech_current_location()` - Latest location
    - `calculate_eta()` - ETA calculation

  3. Security
    - RLS enabled on all tables
    - Techs can update own location
    - All users can view
*/

-- Create tech_locations table
CREATE TABLE IF NOT EXISTS tech_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  latitude numeric(10, 7) NOT NULL,
  longitude numeric(10, 7) NOT NULL,
  accuracy numeric(10, 2),
  heading numeric(5, 2),
  speed numeric(6, 2),
  recorded_at timestamptz DEFAULT now() NOT NULL,
  battery_level integer CHECK (battery_level >= 0 AND battery_level <= 100)
);

-- Create distance_matrix_cache table
CREATE TABLE IF NOT EXISTS distance_matrix_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_lat numeric(10, 7) NOT NULL,
  origin_lng numeric(10, 7) NOT NULL,
  dest_lat numeric(10, 7) NOT NULL,
  dest_lng numeric(10, 7) NOT NULL,
  distance_meters integer NOT NULL,
  duration_seconds integer NOT NULL,
  calculated_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz DEFAULT (now() + interval '7 days') NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tech_locations_tech_time 
  ON tech_locations(technician_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_distance_matrix_coords 
  ON distance_matrix_cache(origin_lat, origin_lng, dest_lat, dest_lng);

CREATE INDEX IF NOT EXISTS idx_distance_matrix_expires 
  ON distance_matrix_cache(expires_at);

-- Enable RLS
ALTER TABLE tech_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE distance_matrix_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tech_locations
CREATE POLICY "Anyone can view tech locations"
  ON tech_locations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Techs can insert their own location"
  ON tech_locations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = technician_id);

-- RLS Policies for distance_matrix_cache
CREATE POLICY "Anyone can view distance cache"
  ON distance_matrix_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can manage distance cache"
  ON distance_matrix_cache FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dispatcher', 'manager')
    )
  );

-- Create function to calculate distance using Haversine formula
CREATE OR REPLACE FUNCTION calculate_distance_meters(
  lat1 numeric,
  lng1 numeric,
  lat2 numeric,
  lng2 numeric
) RETURNS integer AS $$
DECLARE
  earth_radius_km constant numeric := 6371.0;
  d_lat numeric;
  d_lng numeric;
  a numeric;
  c numeric;
  distance_km numeric;
BEGIN
  d_lat := radians(lat2 - lat1);
  d_lng := radians(lng2 - lng1);
  
  a := sin(d_lat / 2) * sin(d_lat / 2) +
       cos(radians(lat1)) * cos(radians(lat2)) *
       sin(d_lng / 2) * sin(d_lng / 2);
  
  c := 2 * atan2(sqrt(a), sqrt(1 - a));
  distance_km := earth_radius_km * c;
  
  RETURN CAST(distance_km * 1000 AS integer);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create function to estimate travel time
CREATE OR REPLACE FUNCTION estimate_travel_time(
  distance_meters integer,
  average_speed_mph numeric DEFAULT 35.0
) RETURNS integer AS $$
DECLARE
  distance_miles numeric;
  time_hours numeric;
  time_seconds integer;
BEGIN
  distance_miles := distance_meters / 1609.34;
  time_hours := distance_miles / average_speed_mph;
  time_seconds := CAST(time_hours * 3600 AS integer);
  
  -- Minimum 5 minutes
  RETURN GREATEST(time_seconds, 300);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create function to get tech's current location
CREATE OR REPLACE FUNCTION get_tech_current_location(tech_id uuid)
RETURNS TABLE (
  latitude numeric,
  longitude numeric,
  recorded_at timestamptz,
  accuracy numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tl.latitude,
    tl.longitude,
    tl.recorded_at,
    tl.accuracy
  FROM tech_locations tl
  WHERE tl.technician_id = tech_id
  ORDER BY tl.recorded_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- Create function to calculate ETA
CREATE OR REPLACE FUNCTION calculate_eta(
  tech_id uuid,
  dest_lat numeric,
  dest_lng numeric
) RETURNS TABLE (
  distance_meters integer,
  travel_time_seconds integer,
  estimated_arrival timestamptz,
  tech_lat numeric,
  tech_lng numeric,
  location_age_seconds integer
) AS $$
DECLARE
  tech_location record;
  calc_distance integer;
  calc_time integer;
BEGIN
  -- Get tech's most recent location
  SELECT * INTO tech_location 
  FROM get_tech_current_location(tech_id);
  
  IF tech_location IS NULL THEN
    RETURN;
  END IF;
  
  -- Calculate distance
  calc_distance := calculate_distance_meters(
    tech_location.latitude,
    tech_location.longitude,
    dest_lat,
    dest_lng
  );
  
  -- Estimate travel time
  calc_time := estimate_travel_time(calc_distance);
  
  -- Return all calculated values
  RETURN QUERY SELECT
    calc_distance,
    calc_time,
    now() + (calc_time || ' seconds')::interval,
    tech_location.latitude,
    tech_location.longitude,
    EXTRACT(epoch FROM (now() - tech_location.recorded_at))::integer;
END;
$$ LANGUAGE plpgsql STABLE;

-- Create cleanup function for old data
CREATE OR REPLACE FUNCTION cleanup_old_tech_locations() RETURNS void AS $$
BEGIN
  -- Delete locations older than 7 days
  DELETE FROM tech_locations
  WHERE recorded_at < now() - interval '7 days';
  
  -- Delete expired cache entries
  DELETE FROM distance_matrix_cache
  WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql;

-- Add helpful comments
COMMENT ON TABLE tech_locations IS 'Real-time GPS locations of technicians';
COMMENT ON TABLE distance_matrix_cache IS 'Cached distance and time calculations';

COMMENT ON FUNCTION calculate_distance_meters IS 'Calculate distance using Haversine formula';
COMMENT ON FUNCTION estimate_travel_time IS 'Estimate travel time based on distance';
COMMENT ON FUNCTION get_tech_current_location IS 'Get most recent tech location';
COMMENT ON FUNCTION calculate_eta IS 'Calculate ETA from tech to destination';
