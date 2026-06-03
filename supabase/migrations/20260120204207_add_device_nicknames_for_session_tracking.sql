/*
  # Device Nicknames for Session Tracking

  1. New Tables
    - `device_nicknames`
      - Store friendly names for device combinations (device_type + browser + os)
      - Examples: "John's iPhone", "Conference Room iPad", "Office Desktop"
      - Color coding for visual distinction
      - Track usage statistics per device

  2. Benefits
    - Admins can identify specific devices used by team members
    - Better tracking of device usage patterns
    - Easier to spot unusual login patterns

  3. Security
    - Enable RLS on device_nicknames
    - Only admins can manage device nicknames
*/

-- Create device_nicknames table
CREATE TABLE IF NOT EXISTS device_nicknames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_signature text NOT NULL, -- Combination of device_type|browser_name|os_name
  device_type text,
  browser_name text,
  os_name text,
  nickname text NOT NULL,
  description text,
  color text DEFAULT '#10B981', -- Default green color
  icon text DEFAULT 'monitor', -- Lucide icon name
  first_seen timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now(),
  session_count integer DEFAULT 0,
  total_time_seconds integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(device_signature)
);

-- Create indexes for device_nicknames
CREATE INDEX IF NOT EXISTS idx_device_nicknames_signature ON device_nicknames(device_signature);
CREATE INDEX IF NOT EXISTS idx_device_nicknames_device_type ON device_nicknames(device_type);
CREATE INDEX IF NOT EXISTS idx_device_nicknames_last_seen ON device_nicknames(last_seen DESC);

-- Enable RLS on device_nicknames
ALTER TABLE device_nicknames ENABLE ROW LEVEL SECURITY;

-- RLS Policies for device_nicknames
CREATE POLICY "Admins can view all device nicknames"
  ON device_nicknames FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert device nicknames"
  ON device_nicknames FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update device nicknames"
  ON device_nicknames FOR UPDATE
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

CREATE POLICY "Admins can delete device nicknames"
  ON device_nicknames FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Function to generate device signature
CREATE OR REPLACE FUNCTION generate_device_signature(
  p_device_type text,
  p_browser_name text,
  p_os_name text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN COALESCE(p_device_type, 'unknown') || '|' || 
         COALESCE(p_browser_name, 'unknown') || '|' || 
         COALESCE(p_os_name, 'unknown');
END;
$$;

-- Function to update device nickname statistics
CREATE OR REPLACE FUNCTION update_device_nickname_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device_signature text;
BEGIN
  -- Generate device signature
  v_device_signature := generate_device_signature(
    NEW.device_type,
    NEW.browser_name,
    NEW.os_name
  );

  -- Update or insert device nickname stats
  INSERT INTO device_nicknames (
    device_signature,
    device_type,
    browser_name,
    os_name,
    nickname,
    last_seen,
    session_count,
    total_time_seconds
  )
  VALUES (
    v_device_signature,
    NEW.device_type,
    NEW.browser_name,
    NEW.os_name,
    v_device_signature, -- Default nickname is the signature
    NEW.last_activity,
    1,
    COALESCE(NEW.duration_seconds, 0)
  )
  ON CONFLICT (device_signature) DO UPDATE SET
    last_seen = EXCLUDED.last_seen,
    session_count = device_nicknames.session_count + 1,
    total_time_seconds = device_nicknames.total_time_seconds + EXCLUDED.total_time_seconds,
    updated_at = now();

  RETURN NEW;
END;
$$;

-- Create trigger to automatically update device stats
DROP TRIGGER IF EXISTS update_device_stats_trigger ON user_sessions;
CREATE TRIGGER update_device_stats_trigger
  AFTER INSERT ON user_sessions
  FOR EACH ROW
  WHEN (NEW.device_type IS NOT NULL OR NEW.browser_name IS NOT NULL)
  EXECUTE FUNCTION update_device_nickname_stats();

-- Drop and recreate the session analytics by device view to include nicknames
DROP VIEW IF EXISTS session_analytics_by_device;
CREATE VIEW session_analytics_by_device AS
SELECT
  us.device_type,
  us.browser_name,
  us.os_name,
  dn.nickname as device_nickname,
  dn.color as device_color,
  dn.icon as device_icon,
  COUNT(DISTINCT us.id) as session_count,
  COUNT(DISTINCT us.user_id) as unique_users,
  SUM(us.duration_seconds) as total_time_seconds,
  AVG(us.duration_seconds) as avg_session_duration,
  MAX(us.last_activity) as last_seen
FROM user_sessions us
LEFT JOIN device_nicknames dn ON generate_device_signature(us.device_type, us.browser_name, us.os_name) = dn.device_signature
WHERE us.device_type IS NOT NULL
GROUP BY us.device_type, us.browser_name, us.os_name, dn.nickname, dn.color, dn.icon;

COMMENT ON TABLE device_nicknames IS 'Stores friendly names for device combinations to help admins identify specific devices';
COMMENT ON FUNCTION generate_device_signature IS 'Generates a unique signature for device identification';
