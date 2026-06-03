/*
  # Add GPS Refinement and Address Fields

  1. Changes to daily_clock_entries
    - Add `clock_in_gps_refined` - Flag indicating if GPS was improved post-capture
    - Add `clock_in_gps_refined_at` - When GPS was refined
    - Add `clock_in_gps_original_accuracy` - Original accuracy before refinement
    - Add `clock_out_gps_refined` - Flag indicating if GPS was improved post-capture
    - Add `clock_out_gps_refined_at` - When GPS was refined
    - Add `clock_out_gps_original_accuracy` - Original accuracy before refinement
    - Add `clock_in_address` - Human-readable address from geocoding
    - Add `clock_out_address` - Human-readable address from geocoding

  2. Changes to time_entries (job clocks)
    - Add same refinement fields for job clock tracking
*/

-- Add GPS refinement and address fields to daily_clock_entries
ALTER TABLE daily_clock_entries
ADD COLUMN IF NOT EXISTS clock_in_gps_refined boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS clock_in_gps_refined_at timestamptz,
ADD COLUMN IF NOT EXISTS clock_in_gps_original_accuracy real,
ADD COLUMN IF NOT EXISTS clock_out_gps_refined boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS clock_out_gps_refined_at timestamptz,
ADD COLUMN IF NOT EXISTS clock_out_gps_original_accuracy real,
ADD COLUMN IF NOT EXISTS clock_in_address text,
ADD COLUMN IF NOT EXISTS clock_out_address text;

-- Add GPS refinement and address fields to time_entries
ALTER TABLE time_entries
ADD COLUMN IF NOT EXISTS clock_in_gps_refined boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS clock_in_gps_refined_at timestamptz,
ADD COLUMN IF NOT EXISTS clock_in_gps_original_accuracy real,
ADD COLUMN IF NOT EXISTS clock_out_gps_refined boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS clock_out_gps_refined_at timestamptz,
ADD COLUMN IF NOT EXISTS clock_out_gps_original_accuracy real,
ADD COLUMN IF NOT EXISTS clock_in_address text,
ADD COLUMN IF NOT EXISTS clock_out_address text;

-- Add indexes for refined GPS lookups
CREATE INDEX IF NOT EXISTS idx_daily_clock_entries_gps_refined
ON daily_clock_entries (clock_in_gps_refined, clock_out_gps_refined)
WHERE clock_in_gps_refined = true OR clock_out_gps_refined = true;

CREATE INDEX IF NOT EXISTS idx_time_entries_gps_refined
ON time_entries (clock_in_gps_refined, clock_out_gps_refined)
WHERE clock_in_gps_refined = true OR clock_out_gps_refined = true;