/*
  # Add Monthly Sales module to Sales department

  Adds the "Monthly Sales" (StaffSalesComparison) module to the Sales department
  so admin/manager/sales_manager/finance users can access it from the navigation.
*/

INSERT INTO department_modules (
  department_id,
  module_key,
  display_name,
  description,
  icon,
  sort_order,
  is_active,
  organization_id
)
SELECT
  d.id,
  'monthly_sales',
  'Monthly Sales',
  'Staff sales comparison and monthly performance tracking',
  'LineChart',
  99,
  true,
  dm.organization_id
FROM departments d
JOIN department_modules dm ON dm.department_id = d.id
WHERE d.display_name ILIKE '%sales%'
  AND NOT EXISTS (
    SELECT 1 FROM department_modules ex
    WHERE ex.department_id = d.id AND ex.module_key = 'monthly_sales'
  )
LIMIT 1;
