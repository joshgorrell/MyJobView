/*
  # Add Commission Management Module to Finance Department

  1. Changes
    - Add commission_management module to Finance department
    - This is the comprehensive Finance-facing commission management page
    - Different from the commissions module which is employee-facing
    
  2. Security
    - Maintains existing RLS policies
*/

-- Add commission management module to Finance department
INSERT INTO department_modules (organization_id, department_id, module_key, display_name, icon, sort_order, description)
SELECT 
  o.id as organization_id,
  d.id as department_id,
  'commission_management',
  'Commission Management',
  'DollarSign',
  (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM department_modules WHERE department_id = d.id AND organization_id = o.id),
  'Approve and process commission payments'
FROM departments d
CROSS JOIN organizations o
WHERE d.name = 'finance'
ON CONFLICT (department_id, module_key) DO NOTHING;