/*
  # Fix Clock Out Policy

  1. Changes
    - Update the RLS policy for daily_clock_entries to allow techs to update their own entries
    - Remove status restriction from USING clause since status changes during the update
    - Keep WITH CHECK to ensure they only update their own entries

  2. Security
    - Techs can still only update their own entries
    - Admins maintain full access
*/

-- Drop existing policy
DROP POLICY IF EXISTS "Techs can update own daily clock entries" ON daily_clock_entries;

-- Recreate with fixed logic
CREATE POLICY "Techs can update own daily clock entries"
  ON daily_clock_entries FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = technician_id
  )
  WITH CHECK (
    auth.uid() = technician_id
  );
