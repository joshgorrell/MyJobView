/*
  # Real-Time Location Dashboard Functions

  1. Functions
    - `get_latest_technician_locations()` - Returns most recent location for each active technician
    - `get_technician_route()` - Returns complete breadcrumb trail for a clock entry
    - `calculate_technician_mileage()` - Calculates total distance traveled

  2. Performance
    - Optimized queries with proper indexing
    - Efficient aggregation for real-time dashboard
*/

-- Function to get latest location for all active technicians
CREATE OR REPLACE FUNCTION get_latest_technician_locations()
RETURNS TABLE (
  technician_id UUID,
  technician_name TEXT,
  technician_role TEXT,
  latitude REAL,
  longitude REAL,
  accuracy REAL,
  speed REAL,
  heading REAL,
  captured_at TIMESTAMPTZ,
  battery_level REAL,
  device_model TEXT,
  status TEXT,
  clock_entry_id UUID,
  clock_in_time TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  WITH latest_locations AS (
    SELECT DISTINCT ON (egb.technician_id)
      egb.technician_id,
      egb.latitude,
      egb.longitude,
      egb.accuracy,
      egb.speed,
      egb.heading,
      egb.captured_at,
      egb.battery_level,
      egb.device_model,
      egb.daily_clock_entry_id
    FROM enhanced_gps_breadcrumbs egb
    INNER JOIN daily_clock_entries dce ON dce.id = egb.daily_clock_entry_id
    WHERE dce.status = 'clocked_in'
      AND dce.clock_out IS NULL
      AND dce.entry_date = CURRENT_DATE
    ORDER BY egb.technician_id, egb.captured_at DESC
  )
  SELECT
    ll.technician_id,
    COALESCE(p.full_name, p.email) as technician_name,
    p.role as technician_role,
    ll.latitude,
    ll.longitude,
    ll.accuracy,
    ll.speed,
    ll.heading,
    ll.captured_at,
    ll.battery_level,
    ll.device_model,
    dce.status,
    dce.id as clock_entry_id,
    dce.clock_in as clock_in_time
  FROM latest_locations ll
  INNER JOIN profiles p ON p.id = ll.technician_id
  INNER JOIN daily_clock_entries dce ON dce.id = ll.daily_clock_entry_id
  ORDER BY ll.captured_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get complete route for a technician
CREATE OR REPLACE FUNCTION get_technician_route(
  p_clock_entry_id UUID
)
RETURNS TABLE (
  id TEXT,
  latitude REAL,
  longitude REAL,
  altitude REAL,
  accuracy REAL,
  speed REAL,
  heading REAL,
  captured_at TIMESTAMPTZ,
  capture_method TEXT,
  battery_level REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    egb.id,
    egb.latitude,
    egb.longitude,
    egb.altitude,
    egb.accuracy,
    egb.speed,
    egb.heading,
    egb.captured_at,
    egb.capture_method,
    egb.battery_level
  FROM enhanced_gps_breadcrumbs egb
  WHERE egb.daily_clock_entry_id = p_clock_entry_id
  ORDER BY egb.captured_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate total mileage for a clock entry
CREATE OR REPLACE FUNCTION calculate_technician_mileage(
  p_clock_entry_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_total_distance REAL := 0;
  v_total_points INTEGER := 0;
  v_avg_speed REAL := 0;
  v_max_speed REAL := 0;
  v_duration_hours REAL := 0;
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
BEGIN
  -- Get total distance using the existing function
  v_total_distance := calculate_trip_distance(p_clock_entry_id);

  -- Get additional metrics
  SELECT
    COUNT(*),
    AVG(speed),
    MAX(speed),
    MIN(captured_at),
    MAX(captured_at)
  INTO
    v_total_points,
    v_avg_speed,
    v_max_speed,
    v_start_time,
    v_end_time
  FROM enhanced_gps_breadcrumbs
  WHERE daily_clock_entry_id = p_clock_entry_id;

  -- Calculate duration in hours
  IF v_start_time IS NOT NULL AND v_end_time IS NOT NULL THEN
    v_duration_hours := EXTRACT(EPOCH FROM (v_end_time - v_start_time)) / 3600.0;
  END IF;

  RETURN jsonb_build_object(
    'total_distance_meters', v_total_distance,
    'total_distance_miles', v_total_distance * 0.000621371,
    'total_points', v_total_points,
    'avg_speed_mph', COALESCE(v_avg_speed * 2.237, 0),
    'max_speed_mph', COALESCE(v_max_speed * 2.237, 0),
    'duration_hours', v_duration_hours,
    'start_time', v_start_time,
    'end_time', v_end_time
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get GPS quality report for a technician
CREATE OR REPLACE FUNCTION get_gps_quality_report(
  p_technician_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_points', COUNT(*),
    'avg_accuracy', AVG(accuracy),
    'min_accuracy', MIN(accuracy),
    'max_accuracy', MAX(accuracy),
    'high_accuracy_percent', (COUNT(*) FILTER (WHERE accuracy < 10) * 100.0 / NULLIF(COUNT(*), 0)),
    'medium_accuracy_percent', (COUNT(*) FILTER (WHERE accuracy >= 10 AND accuracy <= 50) * 100.0 / NULLIF(COUNT(*), 0)),
    'low_accuracy_percent', (COUNT(*) FILTER (WHERE accuracy > 50) * 100.0 / NULLIF(COUNT(*), 0)),
    'avg_battery', AVG(battery_level),
    'devices_used', jsonb_agg(DISTINCT device_model)
  )
  INTO v_result
  FROM enhanced_gps_breadcrumbs
  WHERE technician_id = p_technician_id
    AND DATE(captured_at) BETWEEN p_start_date AND p_end_date;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_latest_technician_locations() TO authenticated;
GRANT EXECUTE ON FUNCTION get_technician_route(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_technician_mileage(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_gps_quality_report(UUID, DATE, DATE) TO authenticated;
