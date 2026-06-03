/*
  # Fix Tech Role Default Starred Modules

  1. Changes
    - Add default starred modules for 'tech' role (currently only has 'technician' and 'field_tech')
    - The roles table has 'tech' as a role_key but default_starred_modules doesn't
    - This causes user creation to fail when creating technicians

  2. Notes
    - Tech role should get the same defaults as technician role
    - Tasks, My Card, My Performance, Team Leaderboard
*/

-- Add default starred modules for 'tech' role (same as technician)
INSERT INTO default_starred_modules (role, module_id, default_order)
SELECT 'tech', module_id, default_order
FROM default_starred_modules
WHERE role = 'technician'
ON CONFLICT (role, module_id) DO NOTHING;

-- Grant module access for 'tech' role (same as technician)
INSERT INTO module_role_access (module_id, role, has_access)
SELECT module_id, 'tech', has_access
FROM module_role_access
WHERE role = 'technician'
ON CONFLICT (module_id, role) DO UPDATE SET has_access = EXCLUDED.has_access;
