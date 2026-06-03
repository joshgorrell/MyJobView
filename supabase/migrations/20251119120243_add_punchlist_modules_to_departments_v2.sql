/*
  # Add Punchlist Modules to Department Structure v2

  ## Summary
  Adds Punchlist module to Production department and VIP Plans to Finance department.
  Uses only allowed roles from the module_role_access constraint.

  ## Changes
  1. Add "Punchlist" module to Production department
     - Real-time task feed
     - Access management
     - Service request conversion
  
  2. Extend Finance department with VIP Plans management
     - Configure plans with punchlist access
     - View/manage customer subscriptions

  ## Navigation Structure
  - Production > Punchlist (staff view)
  - Finance > VIP Plans (admin/sales view)
  - Portal > Punchlist (customer view - conditional)

  ## Allowed Roles
  From constraint: admin, sales, bd, project_manager, technician, office_manager, field_tech, portal_user
*/

-- Get department IDs
DO $$
DECLARE
  v_production_dept_id uuid;
  v_finance_dept_id uuid;
BEGIN
  -- Get Production department ID
  SELECT id INTO v_production_dept_id
  FROM departments
  WHERE name = 'production';

  -- Get Finance department ID
  SELECT id INTO v_finance_dept_id
  FROM departments
  WHERE name = 'finance';

  -- Add Punchlist module to Production department
  IF NOT EXISTS (
    SELECT 1 FROM department_modules 
    WHERE module_key = 'punchlist' AND department_id = v_production_dept_id
  ) THEN
    INSERT INTO department_modules (
      department_id,
      module_key,
      display_name,
      description,
      icon,
      sort_order,
      is_active
    ) VALUES (
      v_production_dept_id,
      'punchlist',
      'Punchlist',
      'Customer punchlist tasks and Test & Tune access management',
      'ClipboardList',
      40,
      true
    );
  END IF;

  -- Add VIP Plans module to Finance department
  IF NOT EXISTS (
    SELECT 1 FROM department_modules 
    WHERE module_key = 'vip-plans' AND department_id = v_finance_dept_id
  ) THEN
    INSERT INTO department_modules (
      department_id,
      module_key,
      display_name,
      description,
      icon,
      sort_order,
      is_active
    ) VALUES (
      v_finance_dept_id,
      'vip-plans',
      'VIP Plans',
      'Manage VIP membership plans with punchlist access',
      'Star',
      30,
      true
    );
  END IF;
END $$;

-- Set role access for Punchlist module
DO $$
DECLARE
  v_punchlist_module_id uuid;
BEGIN
  SELECT id INTO v_punchlist_module_id
  FROM department_modules
  WHERE module_key = 'punchlist';

  -- Admin access
  INSERT INTO module_role_access (module_id, role, has_access)
  VALUES (v_punchlist_module_id, 'admin', true)
  ON CONFLICT DO NOTHING;

  -- Project Manager access (production management)
  INSERT INTO module_role_access (module_id, role, has_access)
  VALUES (v_punchlist_module_id, 'project_manager', true)
  ON CONFLICT DO NOTHING;

  -- Technician access (for viewing assigned tasks)
  INSERT INTO module_role_access (module_id, role, has_access)
  VALUES (v_punchlist_module_id, 'technician', true)
  ON CONFLICT DO NOTHING;

  -- Field Tech access
  INSERT INTO module_role_access (module_id, role, has_access)
  VALUES (v_punchlist_module_id, 'field_tech', true)
  ON CONFLICT DO NOTHING;

  -- Sales access (for access management)
  INSERT INTO module_role_access (module_id, role, has_access)
  VALUES (v_punchlist_module_id, 'sales', true)
  ON CONFLICT DO NOTHING;

  -- Office Manager access
  INSERT INTO module_role_access (module_id, role, has_access)
  VALUES (v_punchlist_module_id, 'office_manager', true)
  ON CONFLICT DO NOTHING;
END $$;

-- Set role access for VIP Plans module
DO $$
DECLARE
  v_vip_plans_module_id uuid;
BEGIN
  SELECT id INTO v_vip_plans_module_id
  FROM department_modules
  WHERE module_key = 'vip-plans';

  -- Admin access
  INSERT INTO module_role_access (module_id, role, has_access)
  VALUES (v_vip_plans_module_id, 'admin', true)
  ON CONFLICT DO NOTHING;

  -- Sales access
  INSERT INTO module_role_access (module_id, role, has_access)
  VALUES (v_vip_plans_module_id, 'sales', true)
  ON CONFLICT DO NOTHING;

  -- Office Manager access
  INSERT INTO module_role_access (module_id, role, has_access)
  VALUES (v_vip_plans_module_id, 'office_manager', true)
  ON CONFLICT DO NOTHING;
END $$;
