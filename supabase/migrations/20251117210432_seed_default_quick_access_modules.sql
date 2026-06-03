/*
  # Seed Default Quick Access Modules

  ## Overview
  Marks certain modules as suggested for quick access and sets up default starred modules by role.

  ## Quick Access Suggestions
  Cross-department modules that are universally useful:
  - Team Pulse (feed) - Company activity feed
  - My Performance (individual_dashboard) - Personal metrics
  - Team Leaderboard (team_leaderboard) - Gamification
  - Tasks - Personal task management
  - Connections - Relationship tracking
  - My Card - Business card access

  ## Default Starred Modules by Role
  - All roles get: Tasks, My Card
  - Sales/BD: + Pipeline Board, Connections, Team Pulse
  - Technicians: + My Performance, Team Leaderboard
  - Managers/Admin: + Team Pulse, Team Leaderboard, Individual Dashboard
*/

-- First, create the cross-department modules that don't exist yet
-- (feed, individual_dashboard, team_leaderboard, tasks, connections, mycard)

DO $$
DECLARE
  pipeline_dept_id uuid;
  admin_dept_id uuid;
  feed_module_id uuid;
  dashboard_module_id uuid;
  leaderboard_module_id uuid;
  tasks_module_id uuid;
  connections_module_id uuid;
  mycard_module_id uuid;
BEGIN
  -- Get department IDs
  SELECT id INTO pipeline_dept_id FROM departments WHERE name = 'pipeline';
  SELECT id INTO admin_dept_id FROM departments WHERE name = 'admin';

  -- Get or create Team Pulse (feed) module in Pipeline
  SELECT id INTO feed_module_id FROM department_modules 
  WHERE department_id = pipeline_dept_id AND module_key = 'feed';
  
  IF feed_module_id IS NULL THEN
    INSERT INTO department_modules (department_id, module_key, display_name, description, icon, sort_order, is_quick_access)
    VALUES (pipeline_dept_id, 'feed', 'Team Pulse', 'Company activity feed and collaboration', 'Activity', 99, true)
    RETURNING id INTO feed_module_id;
  ELSE
    UPDATE department_modules SET is_quick_access = true WHERE id = feed_module_id;
  END IF;

  -- Get or create My Performance (individual_dashboard) in Pipeline
  SELECT id INTO dashboard_module_id FROM department_modules 
  WHERE module_key = 'individual_dashboard' LIMIT 1;
  
  IF dashboard_module_id IS NULL THEN
    INSERT INTO department_modules (department_id, module_key, display_name, description, icon, sort_order, is_quick_access)
    VALUES (pipeline_dept_id, 'individual_dashboard', 'My Performance', 'Personal metrics and achievements', 'TrendingUp', 98, true)
    RETURNING id INTO dashboard_module_id;
  ELSE
    UPDATE department_modules SET is_quick_access = true WHERE id = dashboard_module_id;
  END IF;

  -- Get or create Team Leaderboard in Pipeline
  SELECT id INTO leaderboard_module_id FROM department_modules 
  WHERE module_key = 'team_leaderboard' LIMIT 1;
  
  IF leaderboard_module_id IS NULL THEN
    INSERT INTO department_modules (department_id, module_key, display_name, description, icon, sort_order, is_quick_access)
    VALUES (pipeline_dept_id, 'team_leaderboard', 'Team Leaderboard', 'Team rankings and competition', 'Trophy', 97, true)
    RETURNING id INTO leaderboard_module_id;
  ELSE
    UPDATE department_modules SET is_quick_access = true WHERE id = leaderboard_module_id;
  END IF;

  -- Get Tasks module from Admin
  SELECT id INTO tasks_module_id FROM department_modules 
  WHERE department_id = admin_dept_id AND module_key = 'tasks';
  
  IF tasks_module_id IS NOT NULL THEN
    UPDATE department_modules SET is_quick_access = true WHERE id = tasks_module_id;
  END IF;

  -- Get Connections module from Pipeline
  SELECT id INTO connections_module_id FROM department_modules 
  WHERE department_id = pipeline_dept_id AND module_key = 'connections';
  
  IF connections_module_id IS NOT NULL THEN
    UPDATE department_modules SET is_quick_access = true WHERE id = connections_module_id;
  END IF;

  -- Get My Card module from Admin
  SELECT id INTO mycard_module_id FROM department_modules 
  WHERE department_id = admin_dept_id AND module_key = 'mycard';
  
  IF mycard_module_id IS NOT NULL THEN
    UPDATE department_modules SET is_quick_access = true WHERE id = mycard_module_id;
  END IF;

  -- Now set up default starred modules by role
  -- Everyone gets Tasks and My Card by default
  IF tasks_module_id IS NOT NULL AND mycard_module_id IS NOT NULL THEN
    INSERT INTO default_starred_modules (role, module_id, default_order) VALUES
      ('admin', tasks_module_id, 1),
      ('admin', mycard_module_id, 2),
      ('sales', tasks_module_id, 1),
      ('sales', mycard_module_id, 2),
      ('bd', tasks_module_id, 1),
      ('bd', mycard_module_id, 2),
      ('project_manager', tasks_module_id, 1),
      ('project_manager', mycard_module_id, 2),
      ('technician', tasks_module_id, 1),
      ('technician', mycard_module_id, 2),
      ('office_manager', tasks_module_id, 1),
      ('office_manager', mycard_module_id, 2),
      ('field_tech', tasks_module_id, 1),
      ('field_tech', mycard_module_id, 2)
    ON CONFLICT (role, module_id) DO NOTHING;
  END IF;

  -- Admin and managers get Team Pulse and Leaderboard
  IF feed_module_id IS NOT NULL AND leaderboard_module_id IS NOT NULL THEN
    INSERT INTO default_starred_modules (role, module_id, default_order) VALUES
      ('admin', feed_module_id, 3),
      ('admin', leaderboard_module_id, 4),
      ('project_manager', feed_module_id, 3),
      ('project_manager', leaderboard_module_id, 4),
      ('office_manager', feed_module_id, 3),
      ('office_manager', leaderboard_module_id, 4)
    ON CONFLICT (role, module_id) DO NOTHING;
  END IF;

  -- Sales and BD get Pipeline Board and Connections
  IF connections_module_id IS NOT NULL THEN
    DECLARE
      pipeline_board_id uuid;
    BEGIN
      SELECT id INTO pipeline_board_id FROM department_modules 
      WHERE department_id = pipeline_dept_id AND module_key = 'pipeline_board';
      
      IF pipeline_board_id IS NOT NULL THEN
        INSERT INTO default_starred_modules (role, module_id, default_order) VALUES
          ('sales', pipeline_board_id, 3),
          ('sales', connections_module_id, 4),
          ('bd', pipeline_board_id, 3),
          ('bd', connections_module_id, 4)
        ON CONFLICT (role, module_id) DO NOTHING;
      END IF;
    END;
  END IF;

  -- Technicians get My Performance and Team Leaderboard
  IF dashboard_module_id IS NOT NULL AND leaderboard_module_id IS NOT NULL THEN
    INSERT INTO default_starred_modules (role, module_id, default_order) VALUES
      ('technician', dashboard_module_id, 3),
      ('technician', leaderboard_module_id, 4),
      ('field_tech', dashboard_module_id, 3),
      ('field_tech', leaderboard_module_id, 4)
    ON CONFLICT (role, module_id) DO NOTHING;
  END IF;

  -- Grant access to quick access modules for all roles
  INSERT INTO module_role_access (module_id, role, has_access)
  SELECT dm.id, r.role, true
  FROM department_modules dm
  CROSS JOIN (
    VALUES ('admin'), ('sales'), ('bd'), ('project_manager'), 
           ('technician'), ('office_manager'), ('field_tech'), ('portal_user')
  ) AS r(role)
  WHERE dm.is_quick_access = true
  ON CONFLICT (module_id, role) DO UPDATE SET has_access = EXCLUDED.has_access;

END $$;
