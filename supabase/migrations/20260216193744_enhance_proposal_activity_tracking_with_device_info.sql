/*
  # Enhance Proposal Activity Tracking with Device and IP Information

  1. Changes
    - Update get_proposal_activity_summary function to include:
      - Unique viewer count (distinct IP addresses)
      - List of unique IP addresses with view counts
      - Device type breakdown (mobile, tablet, desktop)
      - Browser and OS information
      - Enhanced activity timeline with device info
    
  2. Notes
    - IP address and device info are captured in metadata field
    - This provides visibility into who is viewing proposals
    - Helps identify if proposals are being shared across locations
*/

-- Drop existing function
DROP FUNCTION IF EXISTS get_proposal_activity_summary(uuid);

-- Recreate the function with enhanced tracking
CREATE OR REPLACE FUNCTION get_proposal_activity_summary(p_proposal_id uuid)
RETURNS TABLE (
  total_views bigint,
  total_time_seconds bigint,
  last_viewed_at timestamptz,
  unique_sessions bigint,
  unique_viewers bigint,
  unique_ips jsonb,
  device_breakdown jsonb,
  browser_breakdown jsonb,
  os_breakdown jsonb,
  activity_timeline jsonb
) AS $$
BEGIN
  RETURN QUERY
  WITH ip_counts AS (
    SELECT 
      ip_address,
      COUNT(*) as view_count,
      MAX(created_at) as last_seen,
      MAX(metadata->>'deviceType') as device_type,
      MAX(metadata->>'browser') as browser,
      MAX(metadata->>'os') as os
    FROM proposal_activity
    WHERE proposal_id = p_proposal_id 
      AND activity_type = 'viewed'
      AND ip_address IS NOT NULL
      AND ip_address != 'Unknown'
    GROUP BY ip_address
  ),
  device_stats AS (
    SELECT 
      metadata->>'deviceType' as device_type,
      COUNT(*) as count
    FROM proposal_activity
    WHERE proposal_id = p_proposal_id 
      AND activity_type = 'viewed'
      AND metadata->>'deviceType' IS NOT NULL
    GROUP BY metadata->>'deviceType'
  ),
  browser_stats AS (
    SELECT 
      metadata->>'browser' as browser,
      COUNT(*) as count
    FROM proposal_activity
    WHERE proposal_id = p_proposal_id 
      AND activity_type = 'viewed'
      AND metadata->>'browser' IS NOT NULL
    GROUP BY metadata->>'browser'
  ),
  os_stats AS (
    SELECT 
      metadata->>'os' as os,
      COUNT(*) as count
    FROM proposal_activity
    WHERE proposal_id = p_proposal_id 
      AND activity_type = 'viewed'
      AND metadata->>'os' IS NOT NULL
    GROUP BY metadata->>'os'
  )
  SELECT
    COUNT(*) FILTER (WHERE activity_type = 'viewed') as total_views,
    SUM(duration_seconds) FILTER (WHERE activity_type = 'time_spent') as total_time_seconds,
    MAX(created_at) FILTER (WHERE activity_type = 'viewed') as last_viewed_at,
    COUNT(DISTINCT user_agent) as unique_sessions,
    (SELECT COUNT(*) FROM ip_counts) as unique_viewers,
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'ip', ip_address,
          'views', view_count,
          'lastSeen', last_seen,
          'deviceType', device_type,
          'browser', browser,
          'os', os
        ) ORDER BY view_count DESC
      ) FROM ip_counts),
      '[]'::jsonb
    ) as unique_ips,
    COALESCE(
      (SELECT jsonb_object_agg(device_type, count) FROM device_stats),
      '{}'::jsonb
    ) as device_breakdown,
    COALESCE(
      (SELECT jsonb_object_agg(browser, count) FROM browser_stats),
      '{}'::jsonb
    ) as browser_breakdown,
    COALESCE(
      (SELECT jsonb_object_agg(os, count) FROM os_stats),
      '{}'::jsonb
    ) as os_breakdown,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'type', activity_type,
          'created_at', created_at,
          'duration', duration_seconds,
          'ip_address', ip_address,
          'deviceType', metadata->>'deviceType',
          'browser', metadata->>'browser',
          'os', metadata->>'os'
        ) ORDER BY created_at DESC
      ) FILTER (WHERE activity_type IN ('viewed', 'downloaded', 'accepted', 'declined')),
      '[]'::jsonb
    ) as activity_timeline
  FROM proposal_activity
  WHERE proposal_id = p_proposal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
