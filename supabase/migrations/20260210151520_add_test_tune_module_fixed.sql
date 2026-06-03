/*
  # Add Test & Tune Module to Production Department

  ## Summary
  Adds the Test & Tune Performance Dashboard module to the Production department
  for tracking 90-day performance periods and bonus calculations.

  ## Changes
  - Insert Test & Tune module into department_modules table
  - Set appropriate display settings and sort order
*/

-- Add Test & Tune module to Production department for each organization
INSERT INTO department_modules (
  department_id,
  module_key,
  display_name,
  description,
  icon,
  sort_order,
  is_active,
  is_quick_access,
  organization_id
) 
SELECT 
  d.id as department_id,
  'test_tune' as module_key,
  'Test & Tune' as display_name,
  '90-Day Performance Tracking & Bonus System' as description,
  'Award' as icon,
  35 as sort_order,
  true as is_active,
  false as is_quick_access,
  d.organization_id
FROM departments d
WHERE d.name = 'production'
ON CONFLICT (department_id, module_key) DO NOTHING;