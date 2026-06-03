/*
  # Fix Service Manager Team Pulse Access

  ## Summary
  Service Managers should have access to Team Pulse (Team Leaderboard) by default,
  but the permission trigger only included 'admin' and 'manager' roles. This migration
  adds 'service_manager' to the list of roles that get team pulse access.

  ## Changes Made

  1. **Update Existing Service Managers**
     - Enable can_view_team_pulse for all service_manager users

  2. **Update Trigger Function**
     - Add 'service_manager' to the list of roles that get team pulse access by default

  ## Important Notes
  - This fixes the issue where Service Managers (like Bobbi Holthaus) couldn't access Team Pulse
  - The trigger will now automatically grant team pulse access to new service_manager users
*/

-- Enable team pulse for all existing service managers
UPDATE profiles
SET can_view_team_pulse = true
WHERE role = 'service_manager'
  AND (can_view_team_pulse IS NULL OR can_view_team_pulse = false);

-- Update the trigger to include service_manager
CREATE OR REPLACE FUNCTION set_default_team_pulse_permission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Default to true for admin, manager, and service_manager
  IF NEW.role IN ('admin', 'manager', 'service_manager') THEN
    NEW.can_view_team_pulse := COALESCE(NEW.can_view_team_pulse, true);
  ELSE
    NEW.can_view_team_pulse := COALESCE(NEW.can_view_team_pulse, false);
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_profile_team_pulse_permission ON profiles;
CREATE TRIGGER on_profile_team_pulse_permission
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_default_team_pulse_permission();
