/*
  # Add Sales TV Dashboard module to Sales department

  Registers "TV Dashboard" as a navigable module in the Sales department
  so admin/manager/finance/sales roles can access it from the sidebar.
  The standalone /sales-tv-dashboard URL route continues to work for
  wall-mounted displays.
*/

-- 1. Insert the module into the Sales department
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
  d.id,
  'sales_tv_dashboard',
  'TV Dashboard',
  'Full-screen sales performance dashboard for wall-mounted displays',
  'Monitor',
  100,
  true,
  false,
  dm.organization_id
FROM departments d
JOIN department_modules dm ON dm.department_id = d.id
WHERE d.display_name ILIKE '%sales%'
  AND NOT EXISTS (
    SELECT 1 FROM department_modules ex
    WHERE ex.department_id = d.id AND ex.module_key = 'sales_tv_dashboard'
  )
LIMIT 1;

-- 2. Grant role_module_access for admin, manager, finance, and sales roles
INSERT INTO role_module_access (role_id, module_id, has_access, organization_id)
SELECT
  r.id,
  dm.id,
  true,
  dm.organization_id
FROM roles r
CROSS JOIN department_modules dm
JOIN departments d ON dm.department_id = d.id
WHERE dm.module_key = 'sales_tv_dashboard'
  AND r.role_key IN ('admin', 'manager', 'finance', 'sales')
  AND NOT EXISTS (
    SELECT 1 FROM role_module_access rma
    WHERE rma.role_id = r.id AND rma.module_id = dm.id
  );
