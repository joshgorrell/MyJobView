/*
  # Add Historical Sales Import Module to Admin Department

  ## Changes

  ### New Module
  - Inserts `historical_sales_import` module into `department_modules` under the Admin department
  - Sort order 90 (after existing admin tools)
  - Admin-only access granted via `role_module_access`

  ### Security
  - Only the `admin` role gets access
  - No other roles are granted access — this is an admin-only data management tool

  ## Notes
  - All rows in department_modules use organization_id = b324e4e3-cd2e-4c68-8df8-3e27c7e08f15
  - Admin department ID: 8ffd86af-1e8e-47e7-ad4a-97445ed7b1fc
  - Admin role ID: 3371461f-b915-48f0-832d-308c9fc85209
*/

DO $$
DECLARE
  v_module_id uuid;
  v_org_id uuid := 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15';
BEGIN
  -- Insert the module if it doesn't exist yet
  IF NOT EXISTS (
    SELECT 1 FROM department_modules WHERE module_key = 'historical_sales_import'
  ) THEN
    v_module_id := gen_random_uuid();
    INSERT INTO department_modules (
      id,
      department_id,
      module_key,
      display_name,
      description,
      icon,
      sort_order,
      is_active,
      organization_id
    ) VALUES (
      v_module_id,
      '8ffd86af-1e8e-47e7-ad4a-97445ed7b1fc',
      'historical_sales_import',
      'Historical Sales Import',
      'Import historical sales statistics from Excel files to power multi-year dashboard reporting',
      'FileSpreadsheet',
      90,
      true,
      v_org_id
    );
  ELSE
    SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'historical_sales_import' LIMIT 1;
  END IF;

  -- Grant access to admin role (unique constraint is role_id + module_id)
  INSERT INTO role_module_access (id, role_id, module_id, has_access, organization_id)
  VALUES (
    gen_random_uuid(),
    '3371461f-b915-48f0-832d-308c9fc85209',  -- admin role
    v_module_id,
    true,
    v_org_id
  )
  ON CONFLICT (role_id, module_id) DO UPDATE SET has_access = true;
END $$;
