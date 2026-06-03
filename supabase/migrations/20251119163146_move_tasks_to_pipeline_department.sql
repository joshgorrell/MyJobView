/*
  # Move Tasks Module to Pipeline Department

  ## Overview
  Tasks is user-specific work management and belongs in Pipeline department
  alongside other personal productivity features like Connections and Leads.

  ## Changes
  1. Move Tasks module from Admin to Pipeline department
  2. Update all related references (starred modules, access permissions)
  3. Add Tasks to all users' starred modules who don't have it yet

  ## Security
  - Maintains existing role access permissions
  - Adds Tasks to Quick Access for all users
*/

DO $$
DECLARE
  pipeline_id uuid;
  admin_id uuid;
  tasks_module_id uuid;
  user_rec RECORD;
  max_star_order int;
BEGIN
  -- Get department IDs
  SELECT id INTO pipeline_id FROM departments WHERE name = 'pipeline';
  SELECT id INTO admin_id FROM departments WHERE name = 'admin';

  -- First, check if tasks exists in admin
  SELECT id INTO tasks_module_id FROM department_modules 
  WHERE module_key = 'tasks' AND department_id = admin_id;

  -- If tasks exists in admin, move it to pipeline
  IF tasks_module_id IS NOT NULL THEN
    UPDATE department_modules 
    SET department_id = pipeline_id,
        sort_order = 10,
        is_quick_access = true
    WHERE id = tasks_module_id;
  ELSE
    -- If tasks doesn't exist, create it in pipeline
    INSERT INTO department_modules (
      department_id, 
      module_key, 
      display_name, 
      description, 
      icon, 
      sort_order,
      is_quick_access
    ) VALUES (
      pipeline_id, 
      'tasks', 
      'My Tasks', 
      'Personal task management and to-do lists', 
      'CheckSquare', 
      10,
      true
    )
    ON CONFLICT (department_id, module_key) DO UPDATE
    SET 
      display_name = EXCLUDED.display_name,
      description = EXCLUDED.description,
      icon = EXCLUDED.icon,
      is_quick_access = true,
      sort_order = 10
    RETURNING id INTO tasks_module_id;

    -- Grant access to all roles
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
  END IF;

  -- Now add Tasks to starred modules for all users who don't have it
  FOR user_rec IN 
    SELECT id FROM profiles
    WHERE NOT EXISTS (
      SELECT 1 FROM user_starred_modules 
      WHERE user_id = profiles.id 
      AND module_id = tasks_module_id
    )
  LOOP
    -- Get the user's current max star_order
    SELECT COALESCE(MAX(star_order), 0) INTO max_star_order
    FROM user_starred_modules
    WHERE user_id = user_rec.id;

    -- Add Tasks as the next item
    INSERT INTO user_starred_modules (user_id, module_id, star_order)
    VALUES (user_rec.id, tasks_module_id, max_star_order + 1)
    ON CONFLICT (user_id, module_id) DO NOTHING;
  END LOOP;

END $$;
