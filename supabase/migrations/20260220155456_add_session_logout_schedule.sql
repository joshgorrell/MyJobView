/*
  # Admin-Configurable Session Logout Schedule

  ## Summary
  Adds a configurable scheduled logout system that allows admins to set a time
  each day when all user sessions are automatically terminated (Supabase auth
  tokens revoked + session records closed).

  ## New Tables
  - `session_logout_schedule`: Stores the admin-configured logout schedule
    - `id` (uuid, PK)
    - `enabled` (boolean) - Whether the scheduled logout is active
    - `logout_time` (time) - Time of day to run the logout (e.g., '00:00:00')
    - `timezone` (text) - Timezone for the logout time (e.g., 'America/Chicago')
    - `label` (text) - Admin-defined label/note for this schedule
    - `last_run_at` (timestamptz) - When the logout last ran
    - `last_run_count` (integer) - How many sessions were closed in last run
    - `updated_by` (uuid) - Which admin last updated this setting
    - `created_at` / `updated_at` (timestamptz)

  ## Changes
  - Seeds a default row (disabled, midnight UTC)
  - RLS: only admins can read/update this table
  - Helper function `get_session_logout_schedule()` for edge functions
  - Helper function `record_scheduled_logout_run()` to log results
*/

CREATE TABLE IF NOT EXISTS session_logout_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled boolean NOT NULL DEFAULT false,
  logout_time time NOT NULL DEFAULT '00:00:00',
  timezone text NOT NULL DEFAULT 'UTC',
  label text NOT NULL DEFAULT 'Daily Session Logout',
  last_run_at timestamptz,
  last_run_count integer DEFAULT 0,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE session_logout_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view session logout schedule"
  ON session_logout_schedule FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can update session logout schedule"
  ON session_logout_schedule FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can insert session logout schedule"
  ON session_logout_schedule FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

INSERT INTO session_logout_schedule (enabled, logout_time, timezone, label)
VALUES (false, '00:00:00', 'UTC', 'Daily Session Logout')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION get_session_logout_schedule()
RETURNS TABLE (
  id uuid,
  enabled boolean,
  logout_time time,
  timezone text,
  label text,
  last_run_at timestamptz,
  last_run_count integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, enabled, logout_time, timezone, label, last_run_at, last_run_count
  FROM session_logout_schedule
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION record_scheduled_logout_run(sessions_closed integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE session_logout_schedule
  SET
    last_run_at = now(),
    last_run_count = sessions_closed,
    updated_at = now()
  WHERE id = (SELECT id FROM session_logout_schedule LIMIT 1);
$$;

CREATE OR REPLACE FUNCTION update_session_logout_schedule_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_session_logout_schedule_updated_at
  BEFORE UPDATE ON session_logout_schedule
  FOR EACH ROW
  EXECUTE FUNCTION update_session_logout_schedule_timestamp();
