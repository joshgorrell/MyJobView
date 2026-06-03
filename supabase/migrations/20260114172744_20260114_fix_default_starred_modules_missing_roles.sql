/*
  # Fix Default Starred Modules for Missing Roles
  
  1. Changes
    - Add default starred modules for roles that don't have them yet:
      - finance
      - manager  
      - service_manager
    - These roles currently exist in the system but have no default starred modules
    - This prevents any potential issues when creating new users with these roles
    
  2. Default Modules
    - finance: Settings, Finance Dashboard
    - manager: Settings, Dashboard
    - service_manager: Settings, Service Request Queue, Dispatch
*/

-- Get module IDs for the default starred modules
DO $$
DECLARE
  settings_module_id uuid;
  finance_module_id uuid;
  dashboard_module_id uuid;
  service_queue_module_id uuid;
  dispatch_module_id uuid;
BEGIN
  -- Get module IDs
  SELECT id INTO settings_module_id FROM department_modules WHERE module_key = 'settings' LIMIT 1;
  SELECT id INTO finance_module_id FROM department_modules WHERE module_key = 'finance_dashboard' LIMIT 1;
  SELECT id INTO dashboard_module_id FROM department_modules WHERE module_key = 'dashboard' LIMIT 1;
  SELECT id INTO service_queue_module_id FROM department_modules WHERE module_key = 'service_request_queue' LIMIT 1;
  SELECT id INTO dispatch_module_id FROM department_modules WHERE module_key = 'dispatch' LIMIT 1;

  -- Add default starred modules for finance role
  IF settings_module_id IS NOT NULL THEN
    INSERT INTO default_starred_modules (role, module_id, default_order)
    VALUES ('finance', settings_module_id, 1)
    ON CONFLICT (role, module_id) DO NOTHING;
  END IF;

  IF finance_module_id IS NOT NULL THEN
    INSERT INTO default_starred_modules (role, module_id, default_order)
    VALUES ('finance', finance_module_id, 2)
    ON CONFLICT (role, module_id) DO NOTHING;
  END IF;

  -- Add default starred modules for manager role
  IF settings_module_id IS NOT NULL THEN
    INSERT INTO default_starred_modules (role, module_id, default_order)
    VALUES ('manager', settings_module_id, 1)
    ON CONFLICT (role, module_id) DO NOTHING;
  END IF;

  IF dashboard_module_id IS NOT NULL THEN
    INSERT INTO default_starred_modules (role, module_id, default_order)
    VALUES ('manager', dashboard_module_id, 2)
    ON CONFLICT (role, module_id) DO NOTHING;
  END IF;

  -- Add default starred modules for service_manager role
  IF settings_module_id IS NOT NULL THEN
    INSERT INTO default_starred_modules (role, module_id, default_order)
    VALUES ('service_manager', settings_module_id, 1)
    ON CONFLICT (role, module_id) DO NOTHING;
  END IF;

  IF service_queue_module_id IS NOT NULL THEN
    INSERT INTO default_starred_modules (role, module_id, default_order)
    VALUES ('service_manager', service_queue_module_id, 2)
    ON CONFLICT (role, module_id) DO NOTHING;
  END IF;

  IF dispatch_module_id IS NOT NULL THEN
    INSERT INTO default_starred_modules (role, module_id, default_order)
    VALUES ('service_manager', dispatch_module_id, 3)
    ON CONFLICT (role, module_id) DO NOTHING;
  END IF;

END $$;
