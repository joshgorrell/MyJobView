-- Add Vehicle Tracking module to Admin department
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
  'vehicle-tracking' as module_key,
  'Vehicle Tracking' as display_name,
  'Manage fleet vehicles and mileage tracking' as description,
  'Car' as icon,
  (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM department_modules WHERE department_id = d.id) as sort_order,
  true as is_active,
  false as is_quick_access,
  d.organization_id
FROM departments d
WHERE d.name = 'admin'
ON CONFLICT (department_id, module_key) DO NOTHING;