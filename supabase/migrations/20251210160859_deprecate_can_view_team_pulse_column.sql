/*
  # Deprecate can_view_team_pulse Column

  ## Summary
  The `can_view_team_pulse` column on the profiles table is now deprecated in favor
  of the unified module access system. Access to the Team Pulse (Team Leaderboard) 
  should be controlled through the `role_module_access` table, not through individual
  boolean columns on the profile.

  ## Changes Made

  1. **Drop Trigger and Function**
     - Remove the `on_profile_team_pulse_permission` trigger
     - Remove the `set_default_team_pulse_permission` function
     - These are no longer needed as module access is controlled through role_module_access

  ## Important Notes
  - The column itself is not dropped to avoid breaking changes
  - All components should use `hasModuleAccess('team_leaderboard')` from DepartmentContext
  - The column can be safely dropped in a future migration once all references are removed
  - Access is now properly controlled through:
    - role_module_access table (role-based permissions)
    - user_permission_overrides table (user-specific overrides)
    - module_access table (additional granular control)
*/

-- Drop the trigger first
DROP TRIGGER IF EXISTS on_profile_team_pulse_permission ON profiles;

-- Drop the function
DROP FUNCTION IF EXISTS set_default_team_pulse_permission();

-- Add a comment to the column indicating it's deprecated
COMMENT ON COLUMN profiles.can_view_team_pulse IS 'DEPRECATED: Use role_module_access table with module_key=team_leaderboard instead. This column is no longer used and can be removed in a future migration.';
