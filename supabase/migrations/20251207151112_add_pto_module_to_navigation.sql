/*
  # Add PTO (Time Off) Module to Navigation

  1. Changes
    - Add Time Off Management module to Admin department
    - Add My Time Off module to Dispatch department (for employees)
    
  2. Notes
    - Admin module for managing policies, approvals, and balances
    - Employee module for viewing balance and requesting time off
*/

-- Add PTO management module to Admin department
INSERT INTO department_modules (department_id, module_key, display_name, description, icon, sort_order, is_active)
SELECT 
  d.id,
  'pto_management',
  'Time Off Management',
  'Manage PTO policies, balances, and approvals',
  'Calendar',
  (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM department_modules WHERE department_id = d.id),
  true
FROM departments d
WHERE d.name = 'admin'
ON CONFLICT DO NOTHING;

-- Add My Time Off module to Dispatch department (for employee use)
INSERT INTO department_modules (department_id, module_key, display_name, description, icon, sort_order, is_active)
SELECT 
  d.id,
  'my_time_off',
  'My Time Off',
  'Request time off and view your PTO balances',
  'Calendar',
  (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM department_modules WHERE department_id = d.id),
  true
FROM departments d
WHERE d.name = 'dispatch'
ON CONFLICT DO NOTHING;
