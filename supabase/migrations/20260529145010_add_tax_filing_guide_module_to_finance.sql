/*
  # Add Tax Filing Guide Module to Finance Department

  1. New Module
    - `tax_filing_guide` — "Tax Filing Guide" module in the Finance department
    - Placed at sort_order 41 (immediately after Sales Tax Reports at 40)
    - Icon: "BookOpen"

  2. Role Access
    - Grants access to `admin`, `finance`, and `manager` roles (same as `tax_reports`)

  3. Notes
    - Copies organization_id from existing finance modules for consistency.
    - Uses DO $$ block to be idempotent — safe to run multiple times.
*/

DO $$
DECLARE
  v_dept_id uuid := 'b7631430-64a0-4e58-b369-32b66eac932c';
  v_org_id uuid;
  v_module_id uuid;
  v_role_id uuid;
BEGIN
  -- Resolve the organization_id from an existing finance module
  SELECT organization_id INTO v_org_id
  FROM department_modules WHERE module_key = 'tax_reports' LIMIT 1;

  -- Insert module if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM department_modules WHERE module_key = 'tax_filing_guide'
  ) THEN
    INSERT INTO department_modules (department_id, module_key, display_name, icon, sort_order, organization_id)
    VALUES (v_dept_id, 'tax_filing_guide', 'Tax Filing Guide', 'BookOpen', 41, v_org_id)
    RETURNING id INTO v_module_id;
  ELSE
    SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'tax_filing_guide';
  END IF;

  -- Grant access to admin role
  SELECT id INTO v_role_id FROM roles WHERE role_key = 'admin' AND organization_id = v_org_id LIMIT 1;
  IF v_role_id IS NOT NULL THEN
    INSERT INTO role_module_access (role_id, module_id, has_access, organization_id)
    VALUES (v_role_id, v_module_id, true, v_org_id)
    ON CONFLICT (role_id, module_id) DO UPDATE SET has_access = true;
  END IF;

  -- Grant access to finance role
  SELECT id INTO v_role_id FROM roles WHERE role_key = 'finance' AND organization_id = v_org_id LIMIT 1;
  IF v_role_id IS NOT NULL THEN
    INSERT INTO role_module_access (role_id, module_id, has_access, organization_id)
    VALUES (v_role_id, v_module_id, true, v_org_id)
    ON CONFLICT (role_id, module_id) DO UPDATE SET has_access = true;
  END IF;

  -- Grant access to manager role
  SELECT id INTO v_role_id FROM roles WHERE role_key = 'manager' AND organization_id = v_org_id LIMIT 1;
  IF v_role_id IS NOT NULL THEN
    INSERT INTO role_module_access (role_id, module_id, has_access, organization_id)
    VALUES (v_role_id, v_module_id, true, v_org_id)
    ON CONFLICT (role_id, module_id) DO UPDATE SET has_access = true;
  END IF;

END $$;
