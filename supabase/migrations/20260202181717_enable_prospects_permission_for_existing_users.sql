/*
  # Enable Prospects Permission for Existing Users

  1. Updates
    - Grant `can_view_prospects = true` to all users with admin, manager, or sales roles
    - This will make the Prospects toggle button visible on the Pipeline Board
  
  2. Notes
    - The toggle button is already implemented in the UI but hidden behind this permission
    - New users with these roles will automatically get this permission via the handle_new_user trigger
*/

-- Update existing users with admin, manager, or sales roles to have prospects permission
UPDATE profiles
SET can_view_prospects = true
WHERE role IN ('admin', 'manager', 'sales')
  AND can_view_prospects = false;
