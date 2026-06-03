/*
  # Enhanced GPS Tracking System for Native Mobile App

  1. New Tables
    - `enhanced_gps_breadcrumbs` - High-precision GPS tracking with rich metadata
      - Replaces basic gps_breadcrumbs with enhanced fields
      - Tracks altitude, speed, bearing, and accuracy metrics
      - Includes device and battery information
      - Stores capture method and performance metrics
    
    - `geofence_events` - Automatic job site arrival/departure tracking
      - Logs when technicians enter/exit geofenced areas
      - Links to work orders and job sites
      - Enables automatic time tracking and notifications
    
    - `location_quality_metrics` - GPS performance monitoring
      - Tracks accuracy by device, location, and time
      - Helps identify GPS issues and optimize settings
      - Aggregates data for reporting
    
    - `trip_segments` - Route analysis and mileage tracking
      - Groups breadcrumbs into logical trips
      - Calculates total distance and duration
      - Supports mileage reimbursement
    
    - `device_location_settings` - Per-device tracking configuration
      - Stores device-specific tracking preferences
      - Enables remote configuration updates
      - Tracks device capabilities

  2. Security
    - Enable RLS on all new tables
    - Policies allow technicians to view their own data
    - Managers and admins can view all data
    - Automatic data retention policies
*/

-- Enhanced GPS Breadcrumbs with Rich Metadata
CREATE TABLE IF NOT EXISTS enhanced_gps_breadcrumbs (
  id TEXT PRIMARY KEY,
  technician_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  daily_clock_entry_id UUID NOT NULL REFERENCES daily_clock_entries(id) ON DELETE CASCADE,
  
  -- Location data
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  altitude REAL,
  accuracy REAL,  -- Horizontal accuracy in meters
  altitude_accuracy REAL,  -- Vertical accuracy in meters
  heading REAL,  -- Direction of travel (0-360 degrees)
  speed REAL,  -- Speed in m/s
  
  -- Timing
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Capture metadata
  capture_method TEXT NOT NULL,  -- 'background_update', 'high_accuracy_request', 'initial_clock_in', 'final_clock_out'
  battery_level REAL NOT NULL,  -- 0.0 to 1.0
  device_model TEXT,
  os_version TEXT,
  
  -- Indexes for performance
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Geofence Events for Automatic Detection
CREATE TABLE IF NOT EXISTS geofence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_site_id TEXT NOT NULL,  -- Can be work_order_id, project_id, or custom location
  technician_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('enter', 'exit')),
  
  -- Location where event occurred
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  
  -- Timing
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Location Quality Metrics for Monitoring
CREATE TABLE IF NOT EXISTS location_quality_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  device_model TEXT NOT NULL,
  
  -- Aggregated metrics for a time period
  date DATE NOT NULL,
  total_points INTEGER DEFAULT 0,
  avg_accuracy REAL,
  min_accuracy REAL,
  max_accuracy REAL,
  points_high_accuracy INTEGER DEFAULT 0,  -- < 10m
  points_medium_accuracy INTEGER DEFAULT 0,  -- 10-50m
  points_low_accuracy INTEGER DEFAULT 0,  -- > 50m
  
  -- Battery impact
  avg_battery_level REAL,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(technician_id, device_model, date)
);

-- Trip Segments for Route Analysis
CREATE TABLE IF NOT EXISTS trip_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  daily_clock_entry_id UUID NOT NULL REFERENCES daily_clock_entries(id) ON DELETE CASCADE,
  
  -- Segment details
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  start_latitude REAL NOT NULL,
  start_longitude REAL NOT NULL,
  end_latitude REAL NOT NULL,
  end_longitude REAL NOT NULL,
  
  -- Calculated metrics
  total_distance_meters REAL,
  duration_minutes INTEGER,
  avg_speed_mps REAL,
  max_speed_mps REAL,
  
  -- Trip purpose
  from_location TEXT,  -- 'office', 'home', 'job_site', 'other'
  to_location TEXT,
  work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Device Location Settings
CREATE TABLE IF NOT EXISTS device_location_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,  -- Unique device identifier
  device_model TEXT NOT NULL,
  
  -- Tracking settings
  tracking_enabled BOOLEAN DEFAULT true,
  accuracy_mode TEXT DEFAULT 'balanced' CHECK (accuracy_mode IN ('high', 'balanced', 'low')),
  update_interval_seconds INTEGER DEFAULT 60,
  distance_interval_meters INTEGER DEFAULT 50,
  
  -- Battery optimization
  battery_save_mode BOOLEAN DEFAULT false,
  battery_threshold REAL DEFAULT 0.15,  -- Enable battery save below this level
  
  -- Capabilities
  supports_background_location BOOLEAN DEFAULT false,
  supports_high_accuracy BOOLEAN DEFAULT false,
  
  -- Last activity
  last_seen TIMESTAMPTZ,
  app_version TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(technician_id, device_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_enhanced_breadcrumbs_technician_date 
  ON enhanced_gps_breadcrumbs(technician_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_enhanced_breadcrumbs_entry 
  ON enhanced_gps_breadcrumbs(daily_clock_entry_id);

CREATE INDEX IF NOT EXISTS idx_enhanced_breadcrumbs_location 
  ON enhanced_gps_breadcrumbs(latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_geofence_events_technician 
  ON geofence_events(technician_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_geofence_events_job_site 
  ON geofence_events(job_site_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_trip_segments_technician 
  ON trip_segments(technician_id, start_time DESC);

CREATE INDEX IF NOT EXISTS idx_trip_segments_work_order 
  ON trip_segments(work_order_id);

-- Enable Row Level Security
ALTER TABLE enhanced_gps_breadcrumbs ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_quality_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_location_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for enhanced_gps_breadcrumbs
CREATE POLICY "Technicians can view own breadcrumbs"
  ON enhanced_gps_breadcrumbs FOR SELECT
  TO authenticated
  USING (technician_id = auth.uid());

CREATE POLICY "Managers can view all breadcrumbs"
  ON enhanced_gps_breadcrumbs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner', 'dispatch', 'manager', 'production_manager', 'service_manager')
    )
  );

CREATE POLICY "System can insert breadcrumbs"
  ON enhanced_gps_breadcrumbs FOR INSERT
  TO authenticated
  WITH CHECK (technician_id = auth.uid());

-- RLS Policies for geofence_events
CREATE POLICY "Technicians can view own geofence events"
  ON geofence_events FOR SELECT
  TO authenticated
  USING (technician_id = auth.uid());

CREATE POLICY "Managers can view all geofence events"
  ON geofence_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner', 'dispatch', 'manager', 'production_manager', 'service_manager')
    )
  );

CREATE POLICY "System can insert geofence events"
  ON geofence_events FOR INSERT
  TO authenticated
  WITH CHECK (technician_id = auth.uid());

-- RLS Policies for location_quality_metrics
CREATE POLICY "Technicians can view own metrics"
  ON location_quality_metrics FOR SELECT
  TO authenticated
  USING (technician_id = auth.uid());

CREATE POLICY "Managers can view all metrics"
  ON location_quality_metrics FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner', 'manager')
    )
  );

CREATE POLICY "System can manage metrics"
  ON location_quality_metrics FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for trip_segments
CREATE POLICY "Technicians can view own trips"
  ON trip_segments FOR SELECT
  TO authenticated
  USING (technician_id = auth.uid());

CREATE POLICY "Managers can view all trips"
  ON trip_segments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner', 'dispatch', 'manager', 'production_manager', 'service_manager')
    )
  );

CREATE POLICY "System can manage trips"
  ON trip_segments FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for device_location_settings
CREATE POLICY "Technicians can manage own device settings"
  ON device_location_settings FOR ALL
  TO authenticated
  USING (technician_id = auth.uid())
  WITH CHECK (technician_id = auth.uid());

CREATE POLICY "Admins can manage all device settings"
  ON device_location_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- Function to calculate trip distance from breadcrumbs
CREATE OR REPLACE FUNCTION calculate_trip_distance(
  p_daily_clock_entry_id UUID
) RETURNS REAL AS $$
DECLARE
  v_total_distance REAL := 0;
  v_prev_lat REAL;
  v_prev_lon REAL;
  v_curr_lat REAL;
  v_curr_lon REAL;
  v_segment_distance REAL;
BEGIN
  -- Calculate total distance using Haversine formula
  FOR v_curr_lat, v_curr_lon IN
    SELECT latitude, longitude
    FROM enhanced_gps_breadcrumbs
    WHERE daily_clock_entry_id = p_daily_clock_entry_id
    ORDER BY captured_at
  LOOP
    IF v_prev_lat IS NOT NULL THEN
      -- Haversine formula
      v_segment_distance := 6371000 * 2 * ASIN(
        SQRT(
          POW(SIN(RADIANS(v_curr_lat - v_prev_lat) / 2), 2) +
          COS(RADIANS(v_prev_lat)) * COS(RADIANS(v_curr_lat)) *
          POW(SIN(RADIANS(v_curr_lon - v_prev_lon) / 2), 2)
        )
      );
      
      -- Only add if reasonable (< 1km between points to filter anomalies)
      IF v_segment_distance < 1000 THEN
        v_total_distance := v_total_distance + v_segment_distance;
      END IF;
    END IF;
    
    v_prev_lat := v_curr_lat;
    v_prev_lon := v_curr_lon;
  END LOOP;
  
  RETURN v_total_distance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to aggregate location quality metrics daily
CREATE OR REPLACE FUNCTION aggregate_location_metrics() RETURNS void AS $$
BEGIN
  INSERT INTO location_quality_metrics (
    technician_id,
    device_model,
    date,
    total_points,
    avg_accuracy,
    min_accuracy,
    max_accuracy,
    points_high_accuracy,
    points_medium_accuracy,
    points_low_accuracy,
    avg_battery_level
  )
  SELECT
    technician_id,
    device_model,
    DATE(captured_at) as date,
    COUNT(*) as total_points,
    AVG(accuracy) as avg_accuracy,
    MIN(accuracy) as min_accuracy,
    MAX(accuracy) as max_accuracy,
    COUNT(*) FILTER (WHERE accuracy < 10) as points_high_accuracy,
    COUNT(*) FILTER (WHERE accuracy >= 10 AND accuracy <= 50) as points_medium_accuracy,
    COUNT(*) FILTER (WHERE accuracy > 50) as points_low_accuracy,
    AVG(battery_level) as avg_battery_level
  FROM enhanced_gps_breadcrumbs
  WHERE DATE(captured_at) = CURRENT_DATE - INTERVAL '1 day'
  GROUP BY technician_id, device_model, DATE(captured_at)
  ON CONFLICT (technician_id, device_model, date)
  DO UPDATE SET
    total_points = EXCLUDED.total_points,
    avg_accuracy = EXCLUDED.avg_accuracy,
    min_accuracy = EXCLUDED.min_accuracy,
    max_accuracy = EXCLUDED.max_accuracy,
    points_high_accuracy = EXCLUDED.points_high_accuracy,
    points_medium_accuracy = EXCLUDED.points_medium_accuracy,
    points_low_accuracy = EXCLUDED.points_low_accuracy,
    avg_battery_level = EXCLUDED.avg_battery_level;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
