/*
  # IP Nicknames and Enhanced Device Tracking

  1. New Tables
    - `ip_nicknames`
      - Store friendly names for IP addresses (Home, Office, Mobile, etc.)
      - Color coding for visual distinction
      - Track usage statistics per IP

  2. Changes to user_sessions
    - Add device_type (mobile, tablet, desktop)
    - Add browser_name (Chrome, Firefox, Safari, etc.)
    - Add browser_version
    - Add os_name (Windows, macOS, iOS, Android, Linux)
    - Add os_version
    - Add device_model (for mobile devices)

  3. New Views
    - `session_analytics_by_location` - Aggregate stats by IP/location
    - `session_analytics_by_device` - Aggregate stats by device type

  4. Security
    - Enable RLS on ip_nicknames
    - Only admins can manage IP nicknames
*/

-- Create ip_nicknames table
CREATE TABLE IF NOT EXISTS ip_nicknames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  nickname text NOT NULL,
  description text,
  color text DEFAULT '#3B82F6', -- Default blue color
  icon text DEFAULT 'map-pin', -- Lucide icon name
  first_seen timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now(),
  session_count integer DEFAULT 0,
  total_time_seconds integer DEFAULT 0,
  is_trusted boolean DEFAULT true, -- For security flagging
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(ip_address)
);

-- Create indexes for ip_nicknames
CREATE INDEX IF NOT EXISTS idx_ip_nicknames_ip_address ON ip_nicknames(ip_address);
CREATE INDEX IF NOT EXISTS idx_ip_nicknames_last_seen ON ip_nicknames(last_seen DESC);

-- Add device tracking columns to user_sessions
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS device_type text; -- mobile, tablet, desktop
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS browser_name text; -- Chrome, Firefox, Safari, etc.
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS browser_version text;
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS os_name text; -- Windows, macOS, iOS, Android, Linux
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS os_version text;
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS device_model text; -- iPhone 14 Pro, etc.
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS device_vendor text; -- Apple, Samsung, etc.

-- Create indexes for device filtering
CREATE INDEX IF NOT EXISTS idx_user_sessions_device_type ON user_sessions(device_type);
CREATE INDEX IF NOT EXISTS idx_user_sessions_browser_name ON user_sessions(browser_name);
CREATE INDEX IF NOT EXISTS idx_user_sessions_os_name ON user_sessions(os_name);
CREATE INDEX IF NOT EXISTS idx_user_sessions_ip_address ON user_sessions(ip_address);

-- Enable RLS on ip_nicknames
ALTER TABLE ip_nicknames ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ip_nicknames
CREATE POLICY "Admins can view all IP nicknames"
  ON ip_nicknames FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert IP nicknames"
  ON ip_nicknames FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update IP nicknames"
  ON ip_nicknames FOR UPDATE
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

CREATE POLICY "Admins can delete IP nicknames"
  ON ip_nicknames FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create view for session analytics by location
CREATE OR REPLACE VIEW session_analytics_by_location AS
SELECT
  us.ip_address,
  COALESCE(ip.nickname, us.ip_address) as location_name,
  ip.color,
  ip.icon,
  ip.is_trusted,
  COUNT(DISTINCT us.id) as session_count,
  COUNT(DISTINCT us.user_id) as unique_users,
  SUM(us.duration_seconds) as total_time_seconds,
  AVG(us.duration_seconds) as avg_session_duration,
  MAX(us.last_activity) as last_seen,
  MIN(us.session_start) as first_seen
FROM user_sessions us
LEFT JOIN ip_nicknames ip ON us.ip_address = ip.ip_address
WHERE us.ip_address IS NOT NULL
GROUP BY us.ip_address, ip.nickname, ip.color, ip.icon, ip.is_trusted;

-- Create view for session analytics by device
CREATE OR REPLACE VIEW session_analytics_by_device AS
SELECT
  us.device_type,
  us.browser_name,
  us.os_name,
  COUNT(DISTINCT us.id) as session_count,
  COUNT(DISTINCT us.user_id) as unique_users,
  SUM(us.duration_seconds) as total_time_seconds,
  AVG(us.duration_seconds) as avg_session_duration,
  MAX(us.last_activity) as last_seen
FROM user_sessions us
WHERE us.device_type IS NOT NULL
GROUP BY us.device_type, us.browser_name, us.os_name;

-- Function to update IP nickname statistics
CREATE OR REPLACE FUNCTION update_ip_nickname_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update or insert IP nickname stats
  INSERT INTO ip_nicknames (ip_address, last_seen, session_count, total_time_seconds)
  VALUES (
    NEW.ip_address,
    NEW.last_activity,
    1,
    COALESCE(NEW.duration_seconds, 0)
  )
  ON CONFLICT (ip_address) DO UPDATE SET
    last_seen = EXCLUDED.last_seen,
    session_count = ip_nicknames.session_count + 1,
    total_time_seconds = ip_nicknames.total_time_seconds + EXCLUDED.total_time_seconds,
    updated_at = now();

  RETURN NEW;
END;
$$;

-- Create trigger to automatically update IP stats
DROP TRIGGER IF EXISTS update_ip_stats_trigger ON user_sessions;
CREATE TRIGGER update_ip_stats_trigger
  AFTER INSERT ON user_sessions
  FOR EACH ROW
  WHEN (NEW.ip_address IS NOT NULL)
  EXECUTE FUNCTION update_ip_nickname_stats();

-- Function to get session location summary for a user
CREATE OR REPLACE FUNCTION get_user_location_summary(
  p_user_id uuid,
  p_days integer DEFAULT 30
)
RETURNS TABLE (
  location_name text,
  ip_address text,
  color text,
  session_count bigint,
  total_hours numeric,
  percentage numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH user_sessions_filtered AS (
    SELECT
      us.ip_address,
      COALESCE(ip.nickname, us.ip_address) as location_name,
      COALESCE(ip.color, '#6B7280') as color,
      us.duration_seconds
    FROM user_sessions us
    LEFT JOIN ip_nicknames ip ON us.ip_address = ip.ip_address
    WHERE us.user_id = p_user_id
      AND us.session_start >= now() - (p_days || ' days')::interval
      AND us.ip_address IS NOT NULL
  ),
  totals AS (
    SELECT SUM(duration_seconds) as total_seconds FROM user_sessions_filtered
  )
  SELECT
    usf.location_name,
    usf.ip_address,
    usf.color,
    COUNT(*)::bigint as session_count,
    ROUND((SUM(usf.duration_seconds) / 3600.0)::numeric, 2) as total_hours,
    ROUND((SUM(usf.duration_seconds)::numeric / NULLIF(t.total_seconds, 0) * 100)::numeric, 1) as percentage
  FROM user_sessions_filtered usf
  CROSS JOIN totals t
  GROUP BY usf.location_name, usf.ip_address, usf.color, t.total_seconds
  ORDER BY SUM(usf.duration_seconds) DESC;
END;
$$;

-- Function to get device usage summary for a user
CREATE OR REPLACE FUNCTION get_user_device_summary(
  p_user_id uuid,
  p_days integer DEFAULT 30
)
RETURNS TABLE (
  device_type text,
  browser_name text,
  os_name text,
  session_count bigint,
  total_hours numeric,
  percentage numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH user_sessions_filtered AS (
    SELECT
      COALESCE(us.device_type, 'unknown') as device_type,
      COALESCE(us.browser_name, 'unknown') as browser_name,
      COALESCE(us.os_name, 'unknown') as os_name,
      us.duration_seconds
    FROM user_sessions us
    WHERE us.user_id = p_user_id
      AND us.session_start >= now() - (p_days || ' days')::interval
  ),
  totals AS (
    SELECT SUM(duration_seconds) as total_seconds FROM user_sessions_filtered
  )
  SELECT
    usf.device_type,
    usf.browser_name,
    usf.os_name,
    COUNT(*)::bigint as session_count,
    ROUND((SUM(usf.duration_seconds) / 3600.0)::numeric, 2) as total_hours,
    ROUND((SUM(usf.duration_seconds)::numeric / NULLIF(t.total_seconds, 0) * 100)::numeric, 1) as percentage
  FROM user_sessions_filtered usf
  CROSS JOIN totals t
  GROUP BY usf.device_type, usf.browser_name, usf.os_name, t.total_seconds
  ORDER BY SUM(usf.duration_seconds) DESC;
END;
$$;
