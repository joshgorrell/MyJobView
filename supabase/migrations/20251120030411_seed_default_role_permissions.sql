/*
  # Seed Default Role Permissions

  1. Purpose
    - Populate role_department_access with sensible defaults for each role
    - Populate role_module_access with module-level permissions for each role
    - Provide a starting point that admins can customize later

  2. Role Permission Strategy
    - **Administrator**: Full access to all departments and modules
    - **Manager**: Access to most operational departments, limited admin access
    - **Sales Representative**: Pipeline, Sales, and basic communication modules
    - **Technician**: Production, Dispatch, and field-related modules
    - **Finance**: Finance department plus related billing/invoicing modules
    - **Dispatcher**: Dispatch operations and scheduling modules
    - **Portal User**: Very limited access to portal-specific modules only

  3. Notes
    - All inserts use ON CONFLICT DO NOTHING to allow re-running safely
    - These are defaults - admins can modify via the Roles tab in Settings
    - Individual users can have overrides via user_permission_overrides
*/

-- Get role IDs for reference
DO $$
DECLARE
  v_admin_id uuid;
  v_manager_id uuid;
  v_sales_id uuid;
  v_tech_id uuid;
  v_finance_id uuid;
  v_dispatcher_id uuid;
  v_portal_id uuid;
  
  -- Department IDs
  v_sales_dept uuid;
  v_admin_dept uuid;
  v_pipeline_dept uuid;
  v_dispatch_dept uuid;
  v_finance_dept uuid;
  v_production_dept uuid;
BEGIN
  -- Get role IDs
  SELECT id INTO v_admin_id FROM roles WHERE role_key = 'admin';
  SELECT id INTO v_manager_id FROM roles WHERE role_key = 'manager';
  SELECT id INTO v_sales_id FROM roles WHERE role_key = 'sales';
  SELECT id INTO v_tech_id FROM roles WHERE role_key = 'tech';
  SELECT id INTO v_finance_id FROM roles WHERE role_key = 'finance';
  SELECT id INTO v_dispatcher_id FROM roles WHERE role_key = 'dispatcher';
  SELECT id INTO v_portal_id FROM roles WHERE role_key = 'portal_user';

  -- Get department IDs
  SELECT id INTO v_sales_dept FROM departments WHERE name = 'sales';
  SELECT id INTO v_admin_dept FROM departments WHERE name = 'admin';
  SELECT id INTO v_pipeline_dept FROM departments WHERE name = 'pipeline';
  SELECT id INTO v_dispatch_dept FROM departments WHERE name = 'dispatch';
  SELECT id INTO v_finance_dept FROM departments WHERE name = 'finance';
  SELECT id INTO v_production_dept FROM departments WHERE name = 'production';

  -- ============================================
  -- ADMINISTRATOR - Full Access
  -- ============================================
  INSERT INTO role_department_access (role_id, department_id, has_access)
  SELECT v_admin_id, id, true
  FROM departments
  ON CONFLICT (role_id, department_id) DO NOTHING;

  INSERT INTO role_module_access (role_id, module_id, has_access)
  SELECT v_admin_id, id, true
  FROM department_modules
  WHERE is_active = true
  ON CONFLICT (role_id, module_id) DO NOTHING;

  -- ============================================
  -- MANAGER - Most departments, limited admin
  -- ============================================
  INSERT INTO role_department_access (role_id, department_id, has_access)
  VALUES
    (v_manager_id, v_sales_dept, true),
    (v_manager_id, v_pipeline_dept, true),
    (v_manager_id, v_dispatch_dept, true),
    (v_manager_id, v_finance_dept, true),
    (v_manager_id, v_production_dept, true),
    (v_manager_id, v_admin_dept, false)
  ON CONFLICT (role_id, department_id) DO NOTHING;

  -- Manager gets all modules in their departments
  INSERT INTO role_module_access (role_id, module_id, has_access)
  SELECT v_manager_id, dm.id, true
  FROM department_modules dm
  WHERE dm.is_active = true
    AND dm.department_id IN (v_sales_dept, v_pipeline_dept, v_dispatch_dept, v_finance_dept, v_production_dept)
    AND dm.module_key NOT IN ('user_management', 'role_permissions', 'menu_builder')
  ON CONFLICT (role_id, module_id) DO NOTHING;

  -- ============================================
  -- SALES REPRESENTATIVE
  -- ============================================
  INSERT INTO role_department_access (role_id, department_id, has_access)
  VALUES
    (v_sales_id, v_sales_dept, true),
    (v_sales_id, v_pipeline_dept, true),
    (v_sales_id, v_dispatch_dept, false),
    (v_sales_id, v_finance_dept, false),
    (v_sales_id, v_production_dept, false),
    (v_sales_id, v_admin_dept, false)
  ON CONFLICT (role_id, department_id) DO NOTHING;

  -- Sales gets sales and pipeline modules
  INSERT INTO role_module_access (role_id, module_id, has_access)
  SELECT v_sales_id, dm.id, true
  FROM department_modules dm
  WHERE dm.is_active = true
    AND dm.department_id IN (v_sales_dept, v_pipeline_dept)
  ON CONFLICT (role_id, module_id) DO NOTHING;

  -- ============================================
  -- TECHNICIAN
  -- ============================================
  INSERT INTO role_department_access (role_id, department_id, has_access)
  VALUES
    (v_tech_id, v_sales_dept, false),
    (v_tech_id, v_pipeline_dept, false),
    (v_tech_id, v_dispatch_dept, true),
    (v_tech_id, v_finance_dept, false),
    (v_tech_id, v_production_dept, true),
    (v_tech_id, v_admin_dept, false)
  ON CONFLICT (role_id, department_id) DO NOTHING;

  -- Tech gets production and some dispatch modules
  INSERT INTO role_module_access (role_id, module_id, has_access)
  SELECT v_tech_id, dm.id, true
  FROM department_modules dm
  WHERE dm.is_active = true
    AND (
      dm.department_id = v_production_dept
      OR (dm.department_id = v_dispatch_dept AND dm.module_key IN ('daily_clock', 'appointments', 'tech_status'))
    )
  ON CONFLICT (role_id, module_id) DO NOTHING;

  -- ============================================
  -- FINANCE
  -- ============================================
  INSERT INTO role_department_access (role_id, department_id, has_access)
  VALUES
    (v_finance_id, v_sales_dept, false),
    (v_finance_id, v_pipeline_dept, false),
    (v_finance_id, v_dispatch_dept, false),
    (v_finance_id, v_finance_dept, true),
    (v_finance_id, v_production_dept, false),
    (v_finance_id, v_admin_dept, false)
  ON CONFLICT (role_id, department_id) DO NOTHING;

  -- Finance gets all finance modules plus contacts from pipeline
  INSERT INTO role_module_access (role_id, module_id, has_access)
  SELECT v_finance_id, dm.id, true
  FROM department_modules dm
  WHERE dm.is_active = true
    AND (
      dm.department_id = v_finance_dept
      OR (dm.department_id = v_pipeline_dept AND dm.module_key IN ('contacts', 'sales_activity'))
    )
  ON CONFLICT (role_id, module_id) DO NOTHING;

  -- ============================================
  -- DISPATCHER
  -- ============================================
  IF v_dispatcher_id IS NOT NULL THEN
    INSERT INTO role_department_access (role_id, department_id, has_access)
    VALUES
      (v_dispatcher_id, v_sales_dept, false),
      (v_dispatcher_id, v_pipeline_dept, false),
      (v_dispatcher_id, v_dispatch_dept, true),
      (v_dispatcher_id, v_finance_dept, false),
      (v_dispatcher_id, v_production_dept, true),
      (v_dispatcher_id, v_admin_dept, false)
    ON CONFLICT (role_id, department_id) DO NOTHING;

    -- Dispatcher gets all dispatch modules plus limited production view
    INSERT INTO role_module_access (role_id, module_id, has_access)
    SELECT v_dispatcher_id, dm.id, true
    FROM department_modules dm
    WHERE dm.is_active = true
      AND (
        dm.department_id = v_dispatch_dept
        OR (dm.department_id = v_production_dept AND dm.module_key IN ('work_orders', 'projects', 'tech_work_center'))
      )
    ON CONFLICT (role_id, module_id) DO NOTHING;
  END IF;

  -- ============================================
  -- PORTAL USER - Very Limited
  -- ============================================
  IF v_portal_id IS NOT NULL THEN
    INSERT INTO role_department_access (role_id, department_id, has_access)
    SELECT v_portal_id, id, false
    FROM departments
    ON CONFLICT (role_id, department_id) DO NOTHING;

    -- Portal users only get specific modules (would need portal-specific modules)
    -- For now, give them nothing by default
  END IF;

END $$;
