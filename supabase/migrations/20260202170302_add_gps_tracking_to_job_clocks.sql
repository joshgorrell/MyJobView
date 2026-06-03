/*
  # Add GPS Tracking to Job Clock (time_entries)

  1. Changes to `time_entries` table
    - Add `clock_in_latitude` - GPS latitude at job clock-in
    - Add `clock_in_longitude` - GPS longitude at job clock-in
    - Add `clock_in_gps_accuracy` - GPS accuracy at job clock-in (in meters)
    - Add `clock_in_gps_capture_method` - How job clock-in GPS was captured
    - Add `clock_in_gps_duration_ms` - How long job clock-in GPS capture took
    - Add `clock_in_gps_attempted_at` - When job clock-in GPS capture was attempted
    - Add `clock_in_gps_captured_at` - When job clock-in GPS was successfully captured
    - Add `clock_out_latitude` - GPS latitude at job clock-out
    - Add `clock_out_longitude` - GPS longitude at job clock-out
    - Add `clock_out_gps_accuracy` - GPS accuracy at job clock-out (in meters)
    - Add `clock_out_gps_capture_method` - How job clock-out GPS was captured
    - Add `clock_out_gps_duration_ms` - How long job clock-out GPS capture took
    - Add `clock_out_gps_attempted_at` - When job clock-out GPS capture was attempted
    - Add `clock_out_gps_captured_at` - When job clock-out GPS was successfully captured

  2. Indexes
    - Add composite index for GPS reporting queries
    - Add index for finding entries with missing GPS data
    - Add index for GPS accuracy analysis
    - Add geospatial indexes for location-based queries

  3. Security & Compliance
    - All GPS fields are nullable to never block clock operations
    - GPS capture methods: 'high_accuracy', 'network', 'cached', 'failed', 'none'
    - Supports audit trail for job site verification
    - Enables billing accuracy and compliance reporting

  4. Notes
    - This brings job clock GPS tracking to parity with daily time clock
    - Enables verification that technicians are on-site when clocking time
    - Supports geofencing validation (comparing to work order address)
    - Provides last known location for safety/emergency purposes
*/

-- Add GPS coordinate fields to time_entries
ALTER TABLE time_entries
ADD COLUMN IF NOT EXISTS clock_in_latitude real,
ADD COLUMN IF NOT EXISTS clock_in_longitude real,
ADD COLUMN IF NOT EXISTS clock_in_gps_accuracy real,
ADD COLUMN IF NOT EXISTS clock_in_gps_capture_method text CHECK (clock_in_gps_capture_method IN ('high_accuracy', 'network', 'cached', 'failed', 'none')),
ADD COLUMN IF NOT EXISTS clock_in_gps_duration_ms integer,
ADD COLUMN IF NOT EXISTS clock_in_gps_attempted_at timestamptz,
ADD COLUMN IF NOT EXISTS clock_in_gps_captured_at timestamptz,
ADD COLUMN IF NOT EXISTS clock_out_latitude real,
ADD COLUMN IF NOT EXISTS clock_out_longitude real,
ADD COLUMN IF NOT EXISTS clock_out_gps_accuracy real,
ADD COLUMN IF NOT EXISTS clock_out_gps_capture_method text CHECK (clock_out_gps_capture_method IN ('high_accuracy', 'network', 'cached', 'failed', 'none')),
ADD COLUMN IF NOT EXISTS clock_out_gps_duration_ms integer,
ADD COLUMN IF NOT EXISTS clock_out_gps_attempted_at timestamptz,
ADD COLUMN IF NOT EXISTS clock_out_gps_captured_at timestamptz;

-- Add composite index for admin GPS reporting on job clocks
CREATE INDEX IF NOT EXISTS idx_time_entries_gps_reporting
ON time_entries (clock_in_gps_capture_method, clock_in_gps_captured_at, technician_id)
WHERE clock_in_gps_captured_at IS NOT NULL;

-- Add index for finding job clock entries with missing GPS data
CREATE INDEX IF NOT EXISTS idx_time_entries_missing_clock_in_gps
ON time_entries (clock_in, technician_id)
WHERE clock_in IS NOT NULL AND clock_in_gps_capture_method IS NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_missing_clock_out_gps
ON time_entries (clock_out, technician_id)
WHERE clock_out IS NOT NULL AND clock_out_gps_capture_method IS NULL;

-- Add index for GPS accuracy analysis on job clocks
CREATE INDEX IF NOT EXISTS idx_time_entries_gps_accuracy
ON time_entries (clock_in_gps_accuracy, clock_out_gps_accuracy, clock_in_gps_captured_at)
WHERE clock_in_gps_accuracy IS NOT NULL;

-- Add geospatial indexes for location-based queries (useful for geofencing and distance calculations)
CREATE INDEX IF NOT EXISTS idx_time_entries_clock_in_location
ON time_entries (clock_in_latitude, clock_in_longitude)
WHERE clock_in_latitude IS NOT NULL AND clock_in_longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_clock_out_location
ON time_entries (clock_out_latitude, clock_out_longitude)
WHERE clock_out_latitude IS NOT NULL AND clock_out_longitude IS NOT NULL;

-- Add index for work order GPS compliance reporting
CREATE INDEX IF NOT EXISTS idx_time_entries_work_order_gps
ON time_entries (work_order_id, clock_in_gps_captured_at, clock_out_gps_captured_at)
WHERE work_order_id IS NOT NULL;