/*
  # Auto Clock-Out Execution Logging and Tracking

  1. New Tables
    - `auto_clock_out_execution_log`
      - Tracks each automated clock-out execution
      - Records timestamp, entries processed, success status
      - Links to affected entries and technicians
  
  2. Schema Changes
    - Add `auto_clocked_out` and `auto_clocked_out_at` to daily_clock_entries
    - Add `auto_clock_out_schedule_enabled` to company_settings
    - Add `last_auto_clock_out_run` to company_settings
  
  3. Security
    - Enable RLS on execution log table
    - Admin and manager roles can view logs
    - System can insert execution logs
*/

-- Add auto clock-out tracking fields to daily_clock_entries
ALTER TABLE daily_clock_entries
ADD COLUMN IF NOT EXISTS auto_clocked_out boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_clocked_out_at timestamptz;

-- Add scheduler settings to company_settings
ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS auto_clock_out_schedule_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS last_auto_clock_out_run timestamptz;

-- Create execution log table
CREATE TABLE IF NOT EXISTS auto_clock_out_execution_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  executed_at timestamptz NOT NULL DEFAULT now(),
  entries_processed integer NOT NULL DEFAULT 0,
  entry_ids uuid[] NOT NULL DEFAULT '{}',
  technician_ids uuid[] NOT NULL DEFAULT '{}',
  technician_names text[] NOT NULL DEFAULT '{}',
  total_points_deducted integer NOT NULL DEFAULT 0,
  admin_notified boolean DEFAULT false,
  admin_notification_ids uuid[] DEFAULT '{}',
  success boolean NOT NULL DEFAULT true,
  error_message text,
  execution_duration_ms integer,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE auto_clock_out_execution_log ENABLE ROW LEVEL SECURITY;

-- Admins and managers can view execution logs
CREATE POLICY "Admins and managers can view auto clock-out logs"
  ON auto_clock_out_execution_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner', 'manager')
    )
  );

-- System can insert logs (via service role)
CREATE POLICY "System can insert execution logs"
  ON auto_clock_out_execution_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create index for querying recent executions
CREATE INDEX IF NOT EXISTS idx_auto_clock_out_log_executed_at 
  ON auto_clock_out_execution_log(executed_at DESC);

-- Create index for querying by technician
CREATE INDEX IF NOT EXISTS idx_auto_clock_out_log_technician_ids 
  ON auto_clock_out_execution_log USING gin(technician_ids);

-- Create function to get recent auto clock-outs
CREATE OR REPLACE FUNCTION get_recent_auto_clock_outs(days_ago integer DEFAULT 7)
RETURNS TABLE (
  entry_id uuid,
  technician_id uuid,
  technician_name text,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  auto_clocked_out_at timestamptz,
  points_deducted integer,
  clock_in_latitude numeric,
  clock_in_longitude numeric,
  clock_out_latitude numeric,
  clock_out_longitude numeric,
  clock_in_address text,
  clock_out_address text,
  clock_in_gps_accuracy real,
  clock_out_gps_accuracy real,
  clock_in_gps_capture_method text,
  clock_out_gps_capture_method text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dce.id,
    dce.technician_id,
    p.full_name,
    dce.clock_in,
    dce.clock_out,
    dce.auto_clocked_out_at,
    dce.points_deducted,
    dce.clock_in_latitude,
    dce.clock_in_longitude,
    dce.clock_out_latitude,
    dce.clock_out_longitude,
    dce.clock_in_address,
    dce.clock_out_address,
    dce.clock_in_gps_accuracy,
    dce.clock_out_gps_accuracy,
    dce.clock_in_gps_capture_method,
    dce.clock_out_gps_capture_method
  FROM daily_clock_entries dce
  JOIN profiles p ON p.id = dce.technician_id
  WHERE dce.auto_clocked_out = true
    AND dce.auto_clocked_out_at >= now() - (days_ago || ' days')::interval
  ORDER BY dce.auto_clocked_out_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
