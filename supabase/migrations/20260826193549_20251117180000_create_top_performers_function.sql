/*
  # Create Top Performers Function
*/
CREATE OR REPLACE FUNCTION get_top_performers(days INTEGER DEFAULT 7)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  completions BIGINT,
  avg_quality NUMERIC,
  photos_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    COUNT(DISTINCT jc.id) as completions,
    ROUND(AVG(jc.quality_score)::numeric, 1) as avg_quality,
    COUNT(DISTINCT jp.id) as photos_count
  FROM profiles p
  LEFT JOIN job_completions jc ON jc.technician_id = p.id
    AND jc.completed_at >= NOW() - (days || ' days')::INTERVAL
  LEFT JOIN job_photos jp ON jp.technician_id = p.id
    AND jp.captured_at >= NOW() - (days || ' days')::INTERVAL
  WHERE p.role IN ('technician', 'lead_technician')
    AND EXISTS (
      SELECT 1 FROM job_completions
      WHERE technician_id = p.id
      AND completed_at >= NOW() - (days || ' days')::INTERVAL
    )
  GROUP BY p.id, p.full_name
  HAVING COUNT(DISTINCT jc.id) > 0
  ORDER BY completions DESC, avg_quality DESC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;