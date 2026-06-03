/*
  # GPS Diagnostics Module

  1. New Module
    - Add GPS Diagnostics to Admin department for tracking GPS capture health

  2. Views
    - Create helpful views for GPS diagnostics reporting
*/

-- Add GPS Diagnostics module to Admin department
DO $$
DECLARE
  v_admin_dept_id uuid;
BEGIN
  -- Get Admin department ID
  SELECT id INTO v_admin_dept_id
  FROM departments
  WHERE name = 'Admin'
  LIMIT 1;

  -- Insert GPS Diagnostics module if it doesn't exist
  IF v_admin_dept_id IS NOT NULL THEN
    INSERT INTO modules (id, name, path, icon, display_order, department_id)
    VALUES (
      gen_random_uuid(),
      'GPS Diagnostics',
      '/admin/gps-diagnostics',
      'MapPin',
      155,
      v_admin_dept_id
    )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Create view for GPS capture statistics by technician
CREATE OR REPLACE VIEW gps_capture_stats_by_technician AS
SELECT
  p.id as technician_id,
  p.full_name,
  p.role,
  COUNT(DISTINCT dce.id) as total_clock_entries,
  
  -- Clock-in statistics
  COUNT(CASE WHEN dce.clock_in_gps_capture_method IS NOT NULL THEN 1 END) as clock_in_gps_attempts,
  COUNT(CASE WHEN dce.clock_in_gps_capture_method NOT IN ('failed', 'none') THEN 1 END) as clock_in_gps_success,
  ROUND(
    100.0 * COUNT(CASE WHEN dce.clock_in_gps_capture_method NOT IN ('failed', 'none') THEN 1 END)::numeric /
    NULLIF(COUNT(CASE WHEN dce.clock_in_gps_capture_method IS NOT NULL THEN 1 END), 0),
    1
  ) as clock_in_success_rate,
  
  -- Accuracy statistics
  ROUND(AVG(dce.clock_in_gps_accuracy)::numeric, 1) as avg_clock_in_accuracy,
  ROUND(AVG(dce.clock_out_gps_accuracy)::numeric, 1) as avg_clock_out_accuracy,
  
  -- Quality scores
  ROUND(AVG(dce.clock_in_gps_quality_score)::numeric, 0) as avg_clock_in_quality_score,
  ROUND(AVG(dce.clock_out_gps_quality_score)::numeric, 0) as avg_clock_out_quality_score,
  
  -- Method breakdown
  COUNT(CASE WHEN dce.clock_in_gps_capture_method = 'high_accuracy' THEN 1 END) as high_accuracy_count,
  COUNT(CASE WHEN dce.clock_in_gps_capture_method = 'network' THEN 1 END) as network_count,
  COUNT(CASE WHEN dce.clock_in_gps_capture_method = 'cached' THEN 1 END) as cached_count,
  COUNT(CASE WHEN dce.clock_in_gps_capture_method IN ('failed', 'none') THEN 1 END) as failed_count,
  
  -- Refinement statistics
  COUNT(CASE WHEN dce.clock_in_gps_refined = true THEN 1 END) as clock_in_refined_count,
  COUNT(CASE WHEN dce.clock_out_gps_refined = true THEN 1 END) as clock_out_refined_count,
  
  -- Duration statistics
  ROUND(AVG(dce.clock_in_gps_duration_ms)::numeric, 0) as avg_capture_duration_ms,
  
  -- Last capture
  MAX(dce.clock_in_gps_captured_at) as last_gps_capture
FROM profiles p
LEFT JOIN daily_clock_entries dce ON dce.technician_id = p.id
WHERE p.role IN ('tech', 'lead_tech', 'tech_manager', 'dispatcher', 'production_manager')
  AND dce.entry_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY p.id, p.full_name, p.role
ORDER BY clock_in_success_rate DESC NULLS LAST, total_clock_entries DESC;

-- Grant select on view
GRANT SELECT ON gps_capture_stats_by_technician TO authenticated;

-- Create view for daily GPS capture statistics
CREATE OR REPLACE VIEW gps_capture_stats_by_day AS
SELECT
  dce.entry_date,
  COUNT(DISTINCT dce.technician_id) as unique_technicians,
  COUNT(dce.id) as total_clock_entries,
  
  -- Success rates
  COUNT(CASE WHEN dce.clock_in_gps_capture_method NOT IN ('failed', 'none') THEN 1 END) as successful_captures,
  ROUND(
    100.0 * COUNT(CASE WHEN dce.clock_in_gps_capture_method NOT IN ('failed', 'none') THEN 1 END)::numeric /
    NULLIF(COUNT(dce.id), 0),
    1
  ) as success_rate,
  
  -- Average accuracy
  ROUND(AVG(dce.clock_in_gps_accuracy)::numeric, 1) as avg_accuracy,
  
  -- Average quality score
  ROUND(AVG(dce.clock_in_gps_quality_score)::numeric, 0) as avg_quality_score,
  
  -- Method breakdown
  COUNT(CASE WHEN dce.clock_in_gps_capture_method = 'high_accuracy' THEN 1 END) as high_accuracy_count,
  COUNT(CASE WHEN dce.clock_in_gps_capture_method = 'network' THEN 1 END) as network_count,
  COUNT(CASE WHEN dce.clock_in_gps_capture_method = 'cached' THEN 1 END) as cached_count,
  COUNT(CASE WHEN dce.clock_in_gps_capture_method IN ('failed', 'none') THEN 1 END) as failed_count
FROM daily_clock_entries dce
WHERE dce.entry_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY dce.entry_date
ORDER BY dce.entry_date DESC;

-- Grant select on view
GRANT SELECT ON gps_capture_stats_by_day TO authenticated;