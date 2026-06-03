/*
  # Add last_seen_fishbowl_at to profiles

  Tracks when each user last viewed the Fishbowl page so the badge only
  shows counts for leads created AFTER their last visit.

  1. Changes
    - `profiles`: new column `last_seen_fishbowl_at` (timestamptz, nullable, default null)

  2. Notes
    - NULL means the user has never visited Fishbowl, so ALL unclaimed leads count
    - Updated by the frontend when the user navigates to the Fishbowl page
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'last_seen_fishbowl_at'
  ) THEN
    ALTER TABLE profiles ADD COLUMN last_seen_fishbowl_at timestamptz DEFAULT NULL;
  END IF;
END $$;
