/*
  # Add Tasks Module to Admin Department

  ## Overview
  The Tasks module was missing from the department structure. This adds it back to the Admin department
  so users can access their personal task management.

  ## Changes
  1. Add 'tasks' module to Admin department
  2. Set it as a quick access module
  3. Grant access to all valid user roles
  4. Add default starred module entries for all roles

  ## Security
  - All authenticated users can access their own tasks
  - RLS policies on tasks table already ensure users only see their own tasks
*/

DO $$
DECLARE
  admin_id uuid;
  tasks_module_id uuid;
BEGIN
  -- Get admin department ID
  SELECT id INTO admin_id FROM departments WHERE name = 'admin';

  -- Add Tasks module (or update if exists)
  INSERT INTO department_modules (
    department_id, 
    module_key, 
    display_name, 
    description, 
    icon, 
    sort_order,
    is_quick_access
  ) VALUES (
    admin_id, 
    'tasks', 
    'My Tasks', 'Personal task management and to-do lists', 
    'CheckSquare', 
    3,
    true
  )
  ON CONFLICT (department_id, module_key) DO UPDATE
  SET 
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    is_quick_access = true
  RETURNING id INTO tasks_module_id;

  -- Grant access to all valid roles
  INSERT INTO module_role_access (module_id, role, has_access) VALUES
    (tasks_module_id, 'admin', true),
    (tasks_module_id, 'sales', true),
    (tasks_module_id, 'bd', true),
    (tasks_module_id, 'project_manager', true),
    (tasks_module_id, 'technician', true),
    (tasks_module_id, 'office_manager', true),
    (tasks_module_id, 'field_tech', true),
    (tasks_module_id, 'portal_user', true)
  ON CONFLICT (module_id, role) DO NOTHING;

  -- Add to default starred modules for all roles
  INSERT INTO default_starred_modules (role, module_id, default_order) VALUES
    ('admin', tasks_module_id, 1),
    ('sales', tasks_module_id, 1),
    ('bd', tasks_module_id, 1),
    ('project_manager', tasks_module_id, 1),
    ('technician', tasks_module_id, 1),
    ('office_manager', tasks_module_id, 1),
    ('field_tech', tasks_module_id, 1),
    ('portal_user', tasks_module_id, 1)
  ON CONFLICT (role, module_id) DO NOTHING;

END $$;
