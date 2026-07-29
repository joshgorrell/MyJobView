/*
  # Add Customer Questions Module to Sales Department

  Registers a new "Customer Questions" module in the Sales department
  navigation sidebar. This gives sales reps and managers a direct link
  to the Customer Questions page where they can see all unread/open
  customer Q&A threads across their proposals.

  ## Access Control
  - Roles with access: admin, sales, bd, office_manager
  - NOT gated to admin only — sales reps must see their own questions
  - The component filters so reps only see threads where they are the
    assigned_sales_rep_id, while admins see all threads.
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
    'customer_questions',
    'Customer Questions',
    'Customer Q&A threads across your proposals',
    'MessageSquareQuestion',
    50,
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
  WHERE department_id = v_sales_dept_id AND module_key = 'customer_questions';

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
