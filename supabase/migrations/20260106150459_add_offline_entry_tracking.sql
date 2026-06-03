/*
  # Add Offline Entry Tracking

  1. Changes
    - Add `offline_entry` column to `daily_clock_entries` to flag entries created offline
    - Add `offline_entry` column to `daily_clock_breaks` to flag breaks created offline
    - Add `admin_reviewed` column to track which offline entries have been reviewed
    - Add `admin_reviewed_by` to track who reviewed the entry
    - Add `admin_reviewed_at` to track when it was reviewed
    - Add `admin_notes` for admin comments on offline entries

  2. Security
    - Only admins can mark entries as reviewed
*/

-- Add offline tracking columns to daily_clock_entries
ALTER TABLE daily_clock_entries
ADD COLUMN IF NOT EXISTS offline_entry boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS admin_reviewed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS admin_reviewed_by uuid REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS admin_reviewed_at timestamptz,
ADD COLUMN IF NOT EXISTS admin_notes text;

-- Add offline tracking column to daily_clock_breaks
ALTER TABLE daily_clock_breaks
ADD COLUMN IF NOT EXISTS offline_entry boolean DEFAULT false;

-- Create index for quick lookup of unreviewed offline entries
CREATE INDEX IF NOT EXISTS idx_daily_clock_offline_unreviewed
ON daily_clock_entries(offline_entry, admin_reviewed)
WHERE offline_entry = true AND admin_reviewed = false;

-- Add comment
COMMENT ON COLUMN daily_clock_entries.offline_entry IS 'Indicates if this entry was created while the user was offline';
COMMENT ON COLUMN daily_clock_entries.admin_reviewed IS 'Indicates if an admin has reviewed and approved this offline entry';
COMMENT ON COLUMN daily_clock_entries.admin_reviewed_by IS 'The admin who reviewed this entry';
COMMENT ON COLUMN daily_clock_entries.admin_reviewed_at IS 'When the entry was reviewed';
COMMENT ON COLUMN daily_clock_entries.admin_notes IS 'Admin notes about the offline entry';
