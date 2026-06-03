/*
  # Synchronize profiles role constraint with roles table

  1. Changes
    - Remove outdated role constraint that includes non-existent roles (bd, technician, portal_user, project_manager)
    - Add new constraint that matches actual roles table (admin, finance, manager, sales, tech)
    - This ensures data integrity between profiles.role and roles.role_key

  2. Notes
    - Old constraint had: admin, sales, bd, technician, portal_user, project_manager, manager
    - Roles table actually has: admin, finance, manager, sales, tech
    - New constraint now matches roles table exactly
*/

-- Drop old constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add new constraint matching roles table
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role = ANY (ARRAY['admin'::text, 'finance'::text, 'manager'::text, 'sales'::text, 'tech'::text]));
