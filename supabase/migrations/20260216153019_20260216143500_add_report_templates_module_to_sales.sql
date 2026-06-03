/*
  # Add Report Templates Module to Sales Department

  1. Changes
    - Adds 'report_templates' module to Sales department
    - Accessible to admin and sales_manager roles
    - Allows users to create and manage proposal PDF report templates

  2. Security
    - Module visibility controlled by role permissions
    - Admin and sales_manager can create company-wide templates
    - All users can create personal templates
*/

-- Add report templates module to Sales department
DO $$
DECLARE
  sales_dept_id uuid;
  org_id uuid;
  max_sort_order int;
BEGIN
  -- Get organization ID
  SELECT id INTO org_id
  FROM organizations
  LIMIT 1;

  IF org_id IS NULL THEN
    RAISE NOTICE 'No organization found, skipping report_templates module creation';
    RETURN;
  END IF;

  -- Get Sales department ID
  SELECT id INTO sales_dept_id
  FROM departments
  WHERE name = 'sales'
  LIMIT 1;

  IF sales_dept_id IS NOT NULL THEN
    -- Get max sort order for sales modules
    SELECT COALESCE(MAX(sort_order), 0) INTO max_sort_order
    FROM department_modules
    WHERE department_id = sales_dept_id;

    -- Insert report templates module
    INSERT INTO department_modules (
      department_id,
      module_key,
      display_name,
      description,
      icon,
      sort_order,
      organization_id
    )
    VALUES (
      sales_dept_id,
      'report_templates',
      'Report Templates',
      'Manage proposal PDF report templates',
      'FileText',
      max_sort_order + 1,
      org_id
    )
    ON CONFLICT (department_id, module_key) DO NOTHING;

    RAISE NOTICE 'Added report_templates module to Sales department';
  END IF;
END $$;
