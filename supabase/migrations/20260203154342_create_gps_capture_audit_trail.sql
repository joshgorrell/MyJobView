/*
  # GPS Capture Audit Trail System

  1. New Tables
    - `gps_capture_attempts`
      - Tracks every GPS capture attempt for complete audit trail
      - Stores method tried, success/failure, accuracy, duration
      - Links to clock entries for analysis
      - Auto-cleanup after 90 days

  2. Security
    - Enable RLS
    - Admin and dispatch can view all attempts
    - Technicians can view their own attempts
*/

-- Create GPS capture attempts table
CREATE TABLE IF NOT EXISTS gps_capture_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  clock_entry_id uuid REFERENCES daily_clock_entries(id) ON DELETE CASCADE,
  attempt_timestamp timestamptz NOT NULL DEFAULT now(),
  method_tried text NOT NULL CHECK (method_tried IN ('high_accuracy', 'network', 'cached', 'emergency', 'failed')),
  success boolean NOT NULL DEFAULT false,
  accuracy_meters numeric,
  latitude numeric,
  longitude numeric,
  duration_ms integer NOT NULL,
  error_code integer,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add indexes
CREATE INDEX idx_gps_capture_attempts_technician ON gps_capture_attempts(technician_id, attempt_timestamp DESC);
CREATE INDEX idx_gps_capture_attempts_clock_entry ON gps_capture_attempts(clock_entry_id);
CREATE INDEX idx_gps_capture_attempts_success ON gps_capture_attempts(success, attempt_timestamp DESC);
CREATE INDEX idx_gps_capture_attempts_cleanup ON gps_capture_attempts(created_at);

-- Enable RLS
ALTER TABLE gps_capture_attempts ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins and dispatch can view all GPS capture attempts"
  ON gps_capture_attempts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dispatcher', 'production_manager', 'service_manager')
    )
  );

CREATE POLICY "Technicians can view own GPS capture attempts"
  ON gps_capture_attempts FOR SELECT
  TO authenticated
  USING (technician_id = auth.uid());

CREATE POLICY "System can insert GPS capture attempts"
  ON gps_capture_attempts FOR INSERT
  TO authenticated
  WITH CHECK (technician_id = auth.uid());

-- Auto-cleanup function for old GPS capture attempts (90 days)
CREATE OR REPLACE FUNCTION cleanup_old_gps_capture_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM gps_capture_attempts
  WHERE created_at < now() - interval '90 days';
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION cleanup_old_gps_capture_attempts() TO authenticated;