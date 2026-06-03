/*
  # Add Special Navigation Modules

  ## Overview
  Adds modules for common navigation items that don't fit neatly into departments:
  - Team Pulse (Feed/Activity)
  - My Card (Business Card)
  - Tasks (Personal Task Management)
  - Help & Support
  - User Preferences

  These modules will be accessible across departments and appear in a special "Quick Access" section.

  ## Changes
  - Add special modules to appropriate departments
  - These are accessible to all authenticated users by default
*/

-- Get admin department ID for special modules
DO $$
DECLARE
  pipeline_id uuid;
  admin_id uuid;
BEGIN
  SELECT id INTO pipeline_id FROM departments WHERE name = 'pipeline';
  SELECT id INTO admin_id FROM departments WHERE name = 'admin';

  -- Add Team Pulse to Pipeline (it's activity feed related to leads/sales)
  INSERT INTO department_modules (department_id, module_key, display_name, description, icon, sort_order, parent_module_id) VALUES
    (pipeline_id, 'feed', 'Team Pulse', 'Company activity feed and team collaboration', 'Activity', 9, NULL)
  ON CONFLICT (department_id, module_key) DO NOTHING;

  -- Add special modules to Admin for universal access
  INSERT INTO department_modules (department_id, module_key, display_name, description, icon, sort_order, parent_module_id) VALUES
    (admin_id, 'mycard', 'My Business Card', 'View and share your digital business card', 'CreditCard', 12, NULL),
    (admin_id, 'tasks', 'My Tasks', 'Personal task management', 'CheckSquare', 13, NULL),
    (admin_id, 'preferences', 'My Preferences', 'User settings and notifications', 'User', 14, NULL),
    (admin_id, 'help', 'Help & Support', 'Documentation and feature guides', 'BookOpen', 15, NULL),
    (admin_id, 'improvements', 'Feature Requests', 'Suggest improvements and vote on features', 'Lightbulb', 16, NULL)
  ON CONFLICT (department_id, module_key) DO NOTHING;

END $$;

-- Grant access to special modules for all authenticated users
DO $$
DECLARE
  module_rec RECORD;
BEGIN
  -- Give all roles access to special common modules
  FOR module_rec IN 
    SELECT id FROM department_modules 
    WHERE module_key IN ('feed', 'mycard', 'tasks', 'preferences', 'help', 'improvements')
  LOOP
    INSERT INTO module_role_access (module_id, role, has_access) VALUES
      (module_rec.id, 'admin', true),
      (module_rec.id, 'sales', true),
      (module_rec.id, 'bd', true),
      (module_rec.id, 'project_manager', true),
      (module_rec.id, 'technician', true),
      (module_rec.id, 'office_manager', true),
      (module_rec.id, 'field_tech', true),
      (module_rec.id, 'portal_user', true)
    ON CONFLICT (module_id, role) DO NOTHING;
  END LOOP;
END $$;
