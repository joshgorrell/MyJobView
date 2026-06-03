/*
  # User Sessions and Activity Tracking

  1. New Tables
    - `user_sessions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `session_start` (timestamptz) - When user logged in
      - `session_end` (timestamptz) - When user logged out or session expired
      - `last_activity` (timestamptz) - Last detected activity
      - `ip_address` (text) - User's IP address
      - `user_agent` (text) - Browser/device info
      - `is_active` (boolean) - Currently active session
      - `duration_seconds` (integer) - Total session duration

    - `user_activity_log`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `action` (text) - What action was performed
      - `page` (text) - What page/module
      - `timestamp` (timestamptz)

  2. Functions
    - `start_user_session()` - Called on login
    - `update_session_activity()` - Updates last activity
    - `end_user_session()` - Called on logout

  3. Security
    - Enable RLS on all tables
    - Only admins can view session data
    - Users can see their own activity
*/

-- Create user_sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  session_start timestamptz NOT NULL DEFAULT now(),
  session_end timestamptz,
  last_activity timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  is_active boolean NOT NULL DEFAULT true,
  duration_seconds integer GENERATED ALWAYS AS (
    CASE
      WHEN session_end IS NOT NULL
      THEN EXTRACT(EPOCH FROM (session_end - session_start))::integer
      ELSE EXTRACT(EPOCH FROM (last_activity - session_start))::integer
    END
  ) STORED,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for user_sessions
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_is_active ON user_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity ON user_sessions(last_activity DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_start ON user_sessions(session_start DESC);

-- Create user_activity_log table
CREATE TABLE IF NOT EXISTS user_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  action text NOT NULL,
  page text,
  metadata jsonb DEFAULT '{}',
  timestamp timestamptz DEFAULT now()
);

-- Create indexes for user_activity_log
CREATE INDEX IF NOT EXISTS idx_user_activity_log_user_id ON user_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_timestamp ON user_activity_log(timestamp DESC);

-- Enable RLS
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_sessions
CREATE POLICY "Admins can view all sessions"
  ON user_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Users can view own sessions"
  ON user_sessions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System can insert sessions"
  ON user_sessions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "System can update own sessions"
  ON user_sessions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RLS Policies for user_activity_log
CREATE POLICY "Admins can view all activity"
  ON user_activity_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Users can view own activity"
  ON user_activity_log FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System can insert activity"
  ON user_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Function to start a new session
CREATE OR REPLACE FUNCTION start_user_session(
  p_user_id uuid,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
BEGIN
  -- End any existing active sessions for this user
  UPDATE user_sessions
  SET
    is_active = false,
    session_end = now()
  WHERE user_id = p_user_id
    AND is_active = true;

  -- Create new session
  INSERT INTO user_sessions (user_id, ip_address, user_agent)
  VALUES (p_user_id, p_ip_address, p_user_agent)
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;

-- Function to update session activity
CREATE OR REPLACE FUNCTION update_session_activity(
  p_user_id uuid,
  p_page text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update last_activity for active session
  UPDATE user_sessions
  SET last_activity = now()
  WHERE user_id = p_user_id
    AND is_active = true;

  -- Log activity if page provided
  IF p_page IS NOT NULL THEN
    INSERT INTO user_activity_log (user_id, action, page)
    VALUES (p_user_id, 'page_view', p_page);
  END IF;
END;
$$;

-- Function to end a session
CREATE OR REPLACE FUNCTION end_user_session(
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_sessions
  SET
    is_active = false,
    session_end = now()
  WHERE user_id = p_user_id
    AND is_active = true;
END;
$$;

-- Function to automatically end stale sessions (inactive for more than 8 hours)
CREATE OR REPLACE FUNCTION cleanup_stale_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_sessions
  SET
    is_active = false,
    session_end = last_activity + INTERVAL '8 hours'
  WHERE is_active = true
    AND last_activity < now() - INTERVAL '8 hours';
END;
$$;
