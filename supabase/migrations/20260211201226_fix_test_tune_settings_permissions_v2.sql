/*
  # Grant Test & Tune Settings Module Access

  1. Changes
    - Grant access to the test_tune_settings module for admin, manager, and service_manager roles
    - This allows these roles to view and configure Test & Tune settings in the Admin section

  2. Security
    - Uses role-based access control through role_module_access table
    - Only grants access to management-level roles
*/

-- Grant access to test_tune_settings module for admin role
INSERT INTO role_module_access (role_id, module_id, has_access, organization_id)
SELECT 
  r.id,
  dm.id,
  true,
  r.organization_id
FROM roles r
CROSS JOIN department_modules dm
WHERE r.role_key = 'admin'
  AND dm.module_key = 'test_tune_settings'
  AND NOT EXISTS (
    SELECT 1 FROM role_module_access rma 
    WHERE rma.role_id = r.id AND rma.module_id = dm.id
  );

-- Grant access to test_tune_settings module for manager role
INSERT INTO role_module_access (role_id, module_id, has_access, organization_id)
SELECT 
  r.id,
  dm.id,
  true,
  r.organization_id
FROM roles r
CROSS JOIN department_modules dm
WHERE r.role_key = 'manager'
  AND dm.module_key = 'test_tune_settings'
  AND NOT EXISTS (
    SELECT 1 FROM role_module_access rma 
    WHERE rma.role_id = r.id AND rma.module_id = dm.id
  );

-- Grant access to test_tune_settings module for service_manager role
INSERT INTO role_module_access (role_id, module_id, has_access, organization_id)
SELECT 
  r.id,
  dm.id,
  true,
  r.organization_id
FROM roles r
CROSS JOIN department_modules dm
WHERE r.role_key = 'service_manager'
  AND dm.module_key = 'test_tune_settings'
  AND NOT EXISTS (
    SELECT 1 FROM role_module_access rma 
    WHERE rma.role_id = r.id AND rma.module_id = dm.id
  );