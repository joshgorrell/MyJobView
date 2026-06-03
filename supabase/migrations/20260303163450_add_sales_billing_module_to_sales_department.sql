/*
  # Add Sales Billing Module to Sales Department

  ## Summary
  Registers the Sales Billing Dashboard as a navigable module in the Sales
  department sidebar. This gives sales reps and managers a direct link to the
  billing dashboard from the sidebar, consistent with how all other sales tabs
  (Pipeline, Activity, Performance, etc.) are wired.

  ## Changes
  - Inserts a new `sales_billing` module into `department_modules` under Sales
  - Sort order 35 places it after Sales Orders and before Design Queue (sort 45)
  - Icon: Receipt
  - Grants access to roles: admin, sales, bd, office_manager

  ## Access Control
  - Roles with access: admin, sales, bd, office_manager
  - Inside SalesBillingDashboard the component already filters so that users
    with role 'sales' (reps) only see their own invoices/orders/work-orders,
    while 'admin' users see all data. No additional RLS needed.
*/

DO $$
DECLARE
  v_sales_dept_id uuid;
  v_org_id uuid;
  v_module_id uuid;
BEGIN
  SELECT id, organization_id INTO v_sales_dept_id, v_org_id
  FROM departments
  WHERE name = 'sales'
  LIMIT 1;

  IF v_sales_dept_id IS NULL THEN
    RAISE NOTICE 'Sales department not found, skipping.';
    RETURN;
  END IF;

  INSERT INTO department_modules (
    organization_id,
    department_id,
    module_key,
    display_name,
    description,
    icon,
    sort_order,
    is_active,
    parent_module_id,
    is_quick_access
  )
  VALUES (
    v_org_id,
    v_sales_dept_id,
    'sales_billing',
    'Billing',
    'Invoices, receivables, and billing pipeline',
    'Receipt',
    35,
    true,
    null,
    false
  )
  ON CONFLICT (department_id, module_key) DO UPDATE SET
    display_name  = EXCLUDED.display_name,
    description   = EXCLUDED.description,
    icon          = EXCLUDED.icon,
    sort_order    = EXCLUDED.sort_order,
    is_active     = EXCLUDED.is_active;

  SELECT id INTO v_module_id
  FROM department_modules
  WHERE department_id = v_sales_dept_id AND module_key = 'sales_billing';

  INSERT INTO module_role_access (organization_id, module_id, role, has_access)
  SELECT v_org_id, v_module_id, r.role, true
  FROM (
    SELECT 'admin'          AS role UNION ALL
    SELECT 'sales'                   UNION ALL
    SELECT 'bd'                      UNION ALL
    SELECT 'office_manager'
  ) r
  ON CONFLICT (module_id, role) DO UPDATE SET has_access = true;
END $$;
