/*
# Add Contract Import Module to Admin Navigation

## Purpose
Registers the "Security Contract Import" page as a module in the department-based
navigation system so admins can access the bulk import tool.
*/

DO $$ 
DECLARE
  v_dept_id uuid;
  v_org_id uuid;
  v_module_id uuid;
  v_role_id uuid;
BEGIN
  SELECT id, organization_id INTO v_dept_id, v_org_id FROM departments WHERE name = 'admin' LIMIT 1;
  SELECT id INTO v_role_id FROM roles WHERE role_key = 'admin' LIMIT 1;
  
  IF v_dept_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM department_modules WHERE module_key = 'contract_import') THEN
      INSERT INTO department_modules (department_id, module_key, display_name, description, icon, sort_order, is_active, organization_id)
      VALUES (v_dept_id, 'contract_import', 'Contract Import', 'Bulk import security contracts from CSV', 'Shield', 85, true, v_org_id)
      RETURNING id INTO v_module_id;
    ELSE
      SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'contract_import' LIMIT 1;
    END IF;
    
    IF v_module_id IS NOT NULL AND v_role_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM role_module_access WHERE module_id = v_module_id AND role_id = v_role_id
    ) THEN
      INSERT INTO role_module_access (module_id, role_id, has_access, organization_id)
      VALUES (v_module_id, v_role_id, true, v_org_id);
    END IF;
  END IF;
END $$;
