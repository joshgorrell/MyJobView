/*
  # Add Team Pulse Tab Permission

  1. Changes
    - Add can_view_team_pulse column to profiles table
    - Default to true for admin/manager roles
    - Default to false for other roles
    - Admin can enable/disable per user
*/

-- Add team pulse permission column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'can_view_team_pulse'
  ) THEN
    ALTER TABLE profiles ADD COLUMN can_view_team_pulse BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Set default to true for existing admin and manager users
UPDATE profiles
SET can_view_team_pulse = true
WHERE role IN ('admin', 'manager')
  AND can_view_team_pulse IS NULL OR can_view_team_pulse = false;

-- Update the trigger to set default based on role
CREATE OR REPLACE FUNCTION set_default_team_pulse_permission()
RETURNS TRIGGER AS $$
BEGIN
  -- Default to true for admin and manager
  IF NEW.role IN ('admin', 'manager') THEN
    NEW.can_view_team_pulse := COALESCE(NEW.can_view_team_pulse, true);
  ELSE
    NEW.can_view_team_pulse := COALESCE(NEW.can_view_team_pulse, false);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_profile_team_pulse_permission ON profiles;
CREATE TRIGGER on_profile_team_pulse_permission
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_default_team_pulse_permission();
