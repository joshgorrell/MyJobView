/*
  # Add Home Clock Review System

  1. New Fields
    - Add `home_clock_review_status` to daily_clock_entries - Track review status ('pending', 'reviewed', 'approved', 'flagged')
    - Add `home_clock_review_notes` to daily_clock_entries - Admin notes about the event
    - Add `reviewed_by` to daily_clock_entries - Admin who reviewed
    - Add `reviewed_at` to daily_clock_entries - When it was reviewed

  2. New View
    - Create view for unreviewed home clock events with technician details

  3. Security
    - Only admins can update review fields
*/

-- Add review fields to daily_clock_entries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_clock_entries' AND column_name = 'home_clock_review_status'
  ) THEN
    ALTER TABLE daily_clock_entries ADD COLUMN home_clock_review_status text DEFAULT 'pending';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_clock_entries' AND column_name = 'home_clock_review_notes'
  ) THEN
    ALTER TABLE daily_clock_entries ADD COLUMN home_clock_review_notes text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_clock_entries' AND column_name = 'reviewed_by'
  ) THEN
    ALTER TABLE daily_clock_entries ADD COLUMN reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_clock_entries' AND column_name = 'reviewed_at'
  ) THEN
    ALTER TABLE daily_clock_entries ADD COLUMN reviewed_at timestamptz;
  END IF;
END $$;

-- Add check constraint for review status
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'daily_clock_entries_review_status_check'
  ) THEN
    ALTER TABLE daily_clock_entries DROP CONSTRAINT daily_clock_entries_review_status_check;
  END IF;

  ALTER TABLE daily_clock_entries ADD CONSTRAINT daily_clock_entries_review_status_check
    CHECK (home_clock_review_status IN ('pending', 'reviewed', 'approved', 'flagged'));
END $$;

-- Create view for home clock events that need review
CREATE OR REPLACE VIEW home_clock_events_pending_review AS
SELECT
  dce.id,
  dce.technician_id,
  dce.entry_date,
  dce.clock_in,
  dce.clock_out,
  dce.clock_in_address,
  dce.clock_out_address,
  dce.clocked_in_from_home,
  dce.clocked_out_from_home,
  dce.home_clock_review_status,
  dce.home_clock_review_notes,
  dce.reviewed_by,
  dce.reviewed_at,
  p.full_name as technician_name,
  p.email as technician_email,
  p.home_address,
  reviewer.full_name as reviewed_by_name,
  -- Calculate distance for clock in
  CASE
    WHEN dce.clock_in_latitude IS NOT NULL
      AND dce.clock_in_longitude IS NOT NULL
      AND p.home_latitude IS NOT NULL
      AND p.home_longitude IS NOT NULL
    THEN calculate_distance_meters(
      dce.clock_in_latitude,
      dce.clock_in_longitude,
      p.home_latitude,
      p.home_longitude
    )
    ELSE NULL
  END as clock_in_distance_meters,
  -- Calculate distance for clock out
  CASE
    WHEN dce.clock_out_latitude IS NOT NULL
      AND dce.clock_out_longitude IS NOT NULL
      AND p.home_latitude IS NOT NULL
      AND p.home_longitude IS NOT NULL
    THEN calculate_distance_meters(
      dce.clock_out_latitude,
      dce.clock_out_longitude,
      p.home_latitude,
      p.home_longitude
    )
    ELSE NULL
  END as clock_out_distance_meters
FROM daily_clock_entries dce
JOIN profiles p ON dce.technician_id = p.id
LEFT JOIN profiles reviewer ON dce.reviewed_by = reviewer.id
WHERE (dce.clocked_in_from_home = true OR dce.clocked_out_from_home = true)
ORDER BY dce.entry_date DESC, dce.clock_in DESC;

-- Grant access to the view
GRANT SELECT ON home_clock_events_pending_review TO authenticated;

-- Add index for faster queries on home clock events
CREATE INDEX IF NOT EXISTS idx_daily_clock_entries_home_clock
  ON daily_clock_entries(clocked_in_from_home, clocked_out_from_home, home_clock_review_status, entry_date DESC);

-- Add index on reviewed_by
CREATE INDEX IF NOT EXISTS idx_daily_clock_entries_reviewed_by
  ON daily_clock_entries(reviewed_by)
  WHERE reviewed_by IS NOT NULL;

COMMENT ON VIEW home_clock_events_pending_review IS
'View showing all clock events where technicians clocked in/out from home.
Includes technician details, distances from home, and review status.
Used by admins to monitor and review home clock events.';

COMMENT ON COLUMN daily_clock_entries.home_clock_review_status IS
'Review status for home clock events: pending, reviewed, approved, or flagged';

COMMENT ON COLUMN daily_clock_entries.home_clock_review_notes IS
'Admin notes about the home clock event review';
