/*
# Assign Invoices Module to Sales and Production Departments

## Purpose
The Invoices page was previously only assigned to the Finance department.
This migration adds the `invoices` module to the Sales and Production
departments as default assignments, making it a shared operational page
across all three departments.

An Admin can still modify these assignments through the existing Admin
page/module assignment controls — these are default assignments, not
hardcoded access.

## Changes

1. New `department_modules` rows
   - Adds `invoices` module to the Sales department (sort_order 4, between
     Sales Orders at 3 and Performance at 5)
   - Adds `invoices` module to the Production department (sort_order 5,
     between Change Orders at 4 and Parts Requests at 6)
   - Both rows reuse the same display_name, description, and icon as the
     existing Finance department row

2. New `role_module_access` rows
   - For the new Sales department `invoices` module row:
     - admin: has_access = true
     - sales: has_access = true
     - business_development: has_access = false (deny by default)
     - manager: has_access = true
     - finance: has_access = false (deny by default — Finance already has
       its own invoices module row)
     - service_manager: has_access = false
     - tech: has_access = false
   - For the new Production department `invoices` module row:
     - admin: has_access = true
     - manager: has_access = true
     - service_manager: has_access = true
     - sales: has_access = false (deny by default — Sales already has its
       own invoices module row)
     - business_development: has_access = false
     - finance: has_access = false
     - tech: has_access = false

3. Removes the `sales_billing` module from the Sales department
   - Deletes role_module_access rows for sales_billing
   - Deletes the department_modules row for sales_billing
   - The SalesBillingDashboard component is being removed from the codebase;
     its features are covered by the shared Invoices page and Sales Stats

## Security
- No RLS policy changes. The invoices table RLS already allows all
  authenticated users in the same organization to view/create/edit invoices.
- No new tables or columns.

## Important Notes
1. The unique constraint on department_modules is (department_id, module_key),
   so the same module_key can exist in multiple departments.
2. Each department gets its own department_modules row, and role_module_access
   is per-department-module row, so Admin can independently toggle access
   per department.
3. The existing Finance department invoices module row is NOT modified.
*/

-- ---------------------------------------------------------------------------
-- Step 1: Add `invoices` module to Sales department
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_sales_dept_id uuid;
    v_prod_dept_id uuid;
    v_org_id uuid;
    v_sales_module_id uuid;
    v_prod_module_id uuid;
    v_role_admin_id uuid;
    v_role_sales_id uuid;
    v_role_biz_dev_id uuid;
    v_role_manager_id uuid;
    v_role_finance_id uuid;
    v_role_service_mgr_id uuid;
    v_role_tech_id uuid;
BEGIN
    SELECT id INTO v_sales_dept_id FROM departments WHERE name = 'sales';
    SELECT id INTO v_prod_dept_id FROM departments WHERE name = 'production';
    SELECT organization_id INTO v_org_id FROM department_modules WHERE module_key = 'invoices' AND department_id = (SELECT id FROM departments WHERE name = 'finance');

    SELECT id INTO v_role_admin_id FROM roles WHERE role_key = 'admin';
    SELECT id INTO v_role_sales_id FROM roles WHERE role_key = 'sales';
    SELECT id INTO v_role_biz_dev_id FROM roles WHERE role_key = 'business_development';
    SELECT id INTO v_role_manager_id FROM roles WHERE role_key = 'manager';
    SELECT id INTO v_role_finance_id FROM roles WHERE role_key = 'finance';
    SELECT id INTO v_role_service_mgr_id FROM roles WHERE role_key = 'service_manager';
    SELECT id INTO v_role_tech_id FROM roles WHERE role_key = 'tech';

    -- Insert invoices module into Sales department (sort_order 4)
    INSERT INTO department_modules (id, department_id, module_key, display_name, description, icon, sort_order, is_active, is_quick_access, organization_id)
    VALUES (
        gen_random_uuid(),
        v_sales_dept_id,
        'invoices',
        'Invoices',
        'Create and manage invoices',
        'FileText',
        4,
        true,
        false,
        v_org_id
    )
    ON CONFLICT (department_id, module_key) DO NOTHING
    RETURNING id INTO v_sales_module_id;

    -- If ON CONFLICT did nothing (row already existed), fetch the id
    IF v_sales_module_id IS NULL THEN
        SELECT id INTO v_sales_module_id FROM department_modules
        WHERE department_id = v_sales_dept_id AND module_key = 'invoices';
    END IF;

    -- Role access for Sales department invoices module
    INSERT INTO role_module_access (id, role_id, module_id, has_access, organization_id)
    VALUES
        (gen_random_uuid(), v_role_admin_id, v_sales_module_id, true, v_org_id),
        (gen_random_uuid(), v_role_sales_id, v_sales_module_id, true, v_org_id),
        (gen_random_uuid(), v_role_biz_dev_id, v_sales_module_id, false, v_org_id),
        (gen_random_uuid(), v_role_manager_id, v_sales_module_id, true, v_org_id),
        (gen_random_uuid(), v_role_finance_id, v_sales_module_id, false, v_org_id),
        (gen_random_uuid(), v_role_service_mgr_id, v_sales_module_id, false, v_org_id),
        (gen_random_uuid(), v_role_tech_id, v_sales_module_id, false, v_org_id)
    ON CONFLICT (role_id, module_id) DO NOTHING;

    -- ---------------------------------------------------------------------------
    -- Step 2: Add `invoices` module to Production department
    -- ---------------------------------------------------------------------------

    INSERT INTO department_modules (id, department_id, module_key, display_name, description, icon, sort_order, is_active, is_quick_access, organization_id)
    VALUES (
        gen_random_uuid(),
        v_prod_dept_id,
        'invoices',
        'Invoices',
        'Create and manage invoices',
        'FileText',
        5,
        true,
        false,
        v_org_id
    )
    ON CONFLICT (department_id, module_key) DO NOTHING
    RETURNING id INTO v_prod_module_id;

    IF v_prod_module_id IS NULL THEN
        SELECT id INTO v_prod_module_id FROM department_modules
        WHERE department_id = v_prod_dept_id AND module_key = 'invoices';
    END IF;

    -- Role access for Production department invoices module
    INSERT INTO role_module_access (id, role_id, module_id, has_access, organization_id)
    VALUES
        (gen_random_uuid(), v_role_admin_id, v_prod_module_id, true, v_org_id),
        (gen_random_uuid(), v_role_sales_id, v_prod_module_id, false, v_org_id),
        (gen_random_uuid(), v_role_biz_dev_id, v_prod_module_id, false, v_org_id),
        (gen_random_uuid(), v_role_manager_id, v_prod_module_id, true, v_org_id),
        (gen_random_uuid(), v_role_finance_id, v_prod_module_id, false, v_org_id),
        (gen_random_uuid(), v_role_service_mgr_id, v_prod_module_id, true, v_org_id),
        (gen_random_uuid(), v_role_tech_id, v_prod_module_id, false, v_org_id)
    ON CONFLICT (role_id, module_id) DO NOTHING;

    -- ---------------------------------------------------------------------------
    -- Step 3: Remove sales_billing module
    -- ---------------------------------------------------------------------------
    -- Delete role_module_access rows for sales_billing
    DELETE FROM role_module_access
    WHERE module_id IN (
        SELECT id FROM department_modules WHERE module_key = 'sales_billing'
    );

    -- Delete the sales_billing department_modules row(s)
    DELETE FROM department_modules WHERE module_key = 'sales_billing';

END $$;
