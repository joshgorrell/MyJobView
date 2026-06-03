/*
  # Add TV Dashboard to Production Department

  ## Changes
  - Adds TV Dashboard module to Production department
  - Sets appropriate icon (Monitor) and sort order
  - Grants access to admin, project_manager, office_manager, and technician roles

  ## Module Details
  - Module Key: tv_dashboard
  - Display Name: TV Dashboard
  - Icon: Monitor
  - Sort Order: 9 (after Job Photos)
  - Path: /tv-dashboard
*/

-- Insert TV Dashboard module into Production department
INSERT INTO department_modules (
  department_id,
  module_key,
  display_name,
  description,
  icon,
  sort_order,
  is_active
)
SELECT 
  id,
  'tv_dashboard',
  'TV Dashboard',
  'Real-time TV display for production metrics and technician status',
  'Monitor',
  9,
  true
FROM departments
WHERE name = 'production'
ON CONFLICT (department_id, module_key) DO NOTHING;

-- Grant access to relevant roles
INSERT INTO module_role_access (module_id, role, has_access)
SELECT 
  m.id,
  role_name,
  true
FROM department_modules m
CROSS JOIN (
  VALUES 
    ('admin'),
    ('project_manager'),
    ('office_manager'),
    ('technician')
) AS roles(role_name)
WHERE m.module_key = 'tv_dashboard'
  AND m.department_id = (SELECT id FROM departments WHERE name = 'production')
ON CONFLICT (module_id, role) DO NOTHING;
