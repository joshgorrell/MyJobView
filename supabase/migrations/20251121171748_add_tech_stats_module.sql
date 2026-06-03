/*
  # Add Tech Stats Module to Production Department

  ## Changes
  - Adds 'tech_stats' module to Production department
  - Enables viewing technician efficiency metrics
  - Shows daily clock time vs job time comparison
  - Includes tech rankings and daily breakdowns

  ## Access Control
  - Viewable by admins, production managers, and office managers
  - Uses role_module_access for role-based permissions
  - Uses existing RLS on daily_clock_entries and time_entries tables

  ## Notes
  - Leverages existing daily_clock_entries table for total day hours
  - Uses existing time_entries table for job-specific hours
  - Calculates efficiency percentage: (job_hours / daily_hours) * 100
*/

-- Add tech_stats module to Production department
INSERT INTO department_modules (department_id, module_key, display_name, description, icon, sort_order)
SELECT
  d.id,
  'tech_stats',
  'Tech Stats',
  'Technician efficiency tracking and performance metrics',
  'BarChart3',
  10
FROM departments d
WHERE d.name = 'production'
ON CONFLICT (department_id, module_key) DO NOTHING;

-- Grant access to admin role
INSERT INTO role_module_access (role_id, module_id, has_access)
SELECT
  r.id,
  dm.id,
  true
FROM roles r
CROSS JOIN department_modules dm
CROSS JOIN departments d
WHERE r.role_key = 'admin'
  AND dm.module_key = 'tech_stats'
  AND dm.department_id = d.id
  AND d.name = 'production'
ON CONFLICT (role_id, module_id) DO UPDATE SET
  has_access = EXCLUDED.has_access;

-- Grant access to production_manager profile role (using profiles.role field)
-- Note: This uses the user_permission_overrides for non-role-based access
INSERT INTO user_permission_overrides (user_id, module_id, override_type, notes, created_by)
SELECT
  p.id,
  dm.id,
  'grant',
  'Production managers can view tech efficiency stats',
  (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1)
FROM profiles p
CROSS JOIN department_modules dm
CROSS JOIN departments d
WHERE p.role = 'production_manager'
  AND dm.module_key = 'tech_stats'
  AND dm.department_id = d.id
  AND d.name = 'production'
  AND NOT EXISTS (
    SELECT 1 FROM user_permission_overrides upo
    WHERE upo.user_id = p.id AND upo.module_id = dm.id
  )
ON CONFLICT (user_id, module_id) DO NOTHING;

-- Grant access to office_manager profile role
INSERT INTO user_permission_overrides (user_id, module_id, override_type, notes, created_by)
SELECT
  p.id,
  dm.id,
  'grant',
  'Office managers can view tech efficiency stats',
  (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1)
FROM profiles p
CROSS JOIN department_modules dm
CROSS JOIN departments d
WHERE p.role = 'office_manager'
  AND dm.module_key = 'tech_stats'
  AND dm.department_id = d.id
  AND d.name = 'production'
  AND NOT EXISTS (
    SELECT 1 FROM user_permission_overrides upo
    WHERE upo.user_id = p.id AND upo.module_id = dm.id
  )
ON CONFLICT (user_id, module_id) DO NOTHING;
