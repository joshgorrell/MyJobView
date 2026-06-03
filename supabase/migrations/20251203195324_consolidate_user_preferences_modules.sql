/*
  # Consolidate User Preferences Modules

  ## Changes
    - Remove standalone "My Card" (mycard) module
    - Remove standalone "Rewards Dashboard" (rewards_dashboard) module
    - These features are now accessible through the "My Preferences" module as tabs

  ## Rationale
    - Business Card editing and Rewards viewing are now integrated into User Preferences
    - This reduces navigation clutter and groups related personal settings together
    - Users access these through My Preferences > My Business Card and My Preferences > My Rewards tabs

  ## Impact
    - Users will no longer see separate menu items for "My Card" and "Rewards"
    - All functionality remains available through the My Preferences section
*/

-- Remove the standalone My Card module
DELETE FROM department_modules WHERE module_key = 'mycard';

-- Remove the standalone Rewards Dashboard module from Pipeline department
DELETE FROM department_modules WHERE module_key = 'rewards_dashboard';

-- Note: The 'preferences' module remains unchanged and now includes Business Card and Rewards as tabs
