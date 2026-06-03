/*
  # Add GPS Metadata Fields for Silent Background Tracking

  1. Changes to `daily_clock_entries` table
    - Add `clock_in_gps_capture_method` - How clock-in GPS location was captured
    - Add `clock_in_gps_duration_ms` - How long clock-in GPS capture took
    - Add `clock_in_gps_attempted_at` - When clock-in GPS capture was attempted
    - Add `clock_in_gps_captured_at` - When clock-in GPS was successfully captured
    - Add `clock_in_gps_accuracy` - GPS accuracy at clock-in
    - Add `clock_out_gps_capture_method` - How clock-out GPS location was captured
    - Add `clock_out_gps_duration_ms` - How long clock-out GPS capture took
    - Add `clock_out_gps_attempted_at` - When clock-out GPS capture was attempted
    - Add `clock_out_gps_captured_at` - When clock-out GPS was successfully captured
    - Add `clock_out_gps_accuracy` - GPS accuracy at clock-out

  2. Indexes
    - Add composite index for GPS reporting queries

  3. Notes
    - All GPS fields are nullable to never block clock operations
    - GPS capture methods: 'high_accuracy', 'network', 'cached', 'failed', 'none'
*/

-- Add GPS metadata fields to daily_clock_entries
ALTER TABLE daily_clock_entries
ADD COLUMN IF NOT EXISTS clock_in_gps_capture_method text CHECK (clock_in_gps_capture_method IN ('high_accuracy', 'network', 'cached', 'failed', 'none')),
ADD COLUMN IF NOT EXISTS clock_in_gps_duration_ms integer,
ADD COLUMN IF NOT EXISTS clock_in_gps_attempted_at timestamptz,
ADD COLUMN IF NOT EXISTS clock_in_gps_captured_at timestamptz,
ADD COLUMN IF NOT EXISTS clock_in_gps_accuracy real,
ADD COLUMN IF NOT EXISTS clock_out_gps_capture_method text CHECK (clock_out_gps_capture_method IN ('high_accuracy', 'network', 'cached', 'failed', 'none')),
ADD COLUMN IF NOT EXISTS clock_out_gps_duration_ms integer,
ADD COLUMN IF NOT EXISTS clock_out_gps_attempted_at timestamptz,
ADD COLUMN IF NOT EXISTS clock_out_gps_captured_at timestamptz,
ADD COLUMN IF NOT EXISTS clock_out_gps_accuracy real;

-- Add composite index for admin GPS reporting
CREATE INDEX IF NOT EXISTS idx_clock_entries_gps_reporting
ON daily_clock_entries (clock_out_gps_capture_method, clock_out_gps_attempted_at, technician_id)
WHERE clock_out_gps_attempted_at IS NOT NULL;

-- Add index for finding entries with missing GPS data
CREATE INDEX IF NOT EXISTS idx_clock_entries_missing_gps
ON daily_clock_entries (clock_out, technician_id)
WHERE clock_out IS NOT NULL AND clock_out_gps_capture_method IS NULL;

-- Add index for GPS accuracy analysis
CREATE INDEX IF NOT EXISTS idx_clock_entries_gps_accuracy
ON daily_clock_entries (clock_out_gps_accuracy, clock_out_gps_captured_at)
WHERE clock_out_gps_accuracy IS NOT NULL;
