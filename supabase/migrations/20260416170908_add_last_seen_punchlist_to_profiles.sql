/*
  # Add last_seen_punchlist_at to profiles

  1. Changes
    - `profiles`: new column `last_seen_punchlist_at` (timestamptz, nullable, default null)
      - Tracks the last time a user visited the internal Punchlist admin page
      - Used to calculate the "unseen" red badge count for new punchlist items

  2. Notes
    - Mirrors the existing `last_seen_fishbowl_at` pattern
    - Nullable so existing users see all items as unseen until first visit
    - No RLS changes needed; profiles RLS already covers this column
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'last_seen_punchlist_at'
  ) THEN
    ALTER TABLE profiles ADD COLUMN last_seen_punchlist_at timestamptz DEFAULT NULL;
  END IF;
END $$;
