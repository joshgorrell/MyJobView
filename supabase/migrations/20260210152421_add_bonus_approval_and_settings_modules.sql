/*
  # Add Bonus Approval and Test & Tune Settings Modules

  ## Summary
  Adds the Bonus Approval Dashboard to Finance department and
  Test & Tune Settings to Admin department navigation.

  ## Changes
  - Add Bonus Approvals module to Finance department
  - Add Test & Tune Settings module to Admin department
*/

-- Add Bonus Approvals module to Finance department
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
  'bonus_approvals' as module_key,
  'Bonus Approvals' as display_name,
  'Review and approve Test & Tune performance bonuses' as description,
  'Award' as icon,
  40 as sort_order,
  true as is_active,
  false as is_quick_access,
  d.organization_id
FROM departments d
WHERE d.name = 'finance'
ON CONFLICT (department_id, module_key) DO NOTHING;

-- Add Test & Tune Settings module to Admin department
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
  'test_tune_settings' as module_key,
  'Test & Tune Settings' as display_name,
  'Configure bonus tiers and performance tracking' as description,
  'Settings' as icon,
  80 as sort_order,
  true as is_active,
  false as is_quick_access,
  d.organization_id
FROM departments d
WHERE d.name = 'admin'
ON CONFLICT (department_id, module_key) DO NOTHING;