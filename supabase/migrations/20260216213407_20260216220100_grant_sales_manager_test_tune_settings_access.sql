/*
  # Grant Sales Manager Access to Test & Tune Settings Module

  1. Changes
    - Grant access to the test_tune_settings module for sales_manager role
    - This allows sales managers to view and edit Test & Tune settings in the Admin section
    - Complements the RLS policy update that allows sales_manager to update settings

  2. Security
    - Uses role-based access control through role_module_access table
    - Only grants access to sales_manager role
    - Read-write access is controlled by the RLS policies on test_tune_settings table
*/

-- Grant access to test_tune_settings module for sales_manager role
INSERT INTO role_module_access (role_id, module_id, has_access, organization_id)
SELECT 
  r.id,
  dm.id,
  true,
  r.organization_id
FROM roles r
CROSS JOIN department_modules dm
WHERE r.role_key = 'sales_manager'
  AND dm.module_key = 'test_tune_settings'
  AND NOT EXISTS (
    SELECT 1 FROM role_module_access rma 
    WHERE rma.role_id = r.id AND rma.module_id = dm.id
  );
