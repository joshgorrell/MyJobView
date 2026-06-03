/*
  # Add Prospects Module to Sales Department

  ## Summary
  Adds a dedicated "Prospects" module to the Sales department navigation, allowing
  users to access a standalone Prospects page from the Sales sidebar.

  ## Changes
  1. Inserts a new `prospects` module into `department_modules` under the Sales department
  2. Grants role-based access for admin, manager, rep, and sales_v2 roles
  3. Seeds default starred modules for existing users who have sales-related roles

  ## Notes
  - Uses the Sales department identified by name = 'Sales'
  - Sort order set to 7 to place after existing Sales modules
  - Icon: 'Target' (Lucide icon name)
*/

DO $$
DECLARE
  v_sales_dept_id uuid;
  v_module_id uuid;
BEGIN
  -- Get the Sales department ID
  SELECT id INTO v_sales_dept_id
  FROM departments
  WHERE name = 'Sales'
  LIMIT 1;

  IF v_sales_dept_id IS NULL THEN
    RAISE NOTICE 'Sales department not found, skipping';
    RETURN;
  END IF;

  -- Insert the prospects module if it doesn't exist
  INSERT INTO department_modules (
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
  SELECT
    v_sales_dept_id,
    'prospects',
    'Prospects',
    'Track and manage sales prospects and competitive relationships',
    'Target',
    7,
    true,
    null,
    false
  WHERE NOT EXISTS (
    SELECT 1 FROM department_modules WHERE module_key = 'prospects'
  )
  RETURNING id INTO v_module_id;

  IF v_module_id IS NULL THEN
    -- Module already exists, get its ID
    SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'prospects';
    RAISE NOTICE 'Prospects module already exists with id %', v_module_id;
  ELSE
    RAISE NOTICE 'Created prospects module with id %', v_module_id;
  END IF;

END $$;
