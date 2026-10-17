/*\n  # Add By Office module to Sales department\n  Grants access to admin, manager, and sales roles.\n*/\n\n-- Insert the module\nINSERT INTO department_modules (department_id, module_key, display_name, description, icon, sort_order, is_active, organization_id)\nSELECT d.id, 'by_office', 'By Office', 'Sales breakdown by office location', 'Building2', 101, true, dm.organization_id\nFROM departments d\nJOIN department_modules dm ON dm.department_id = d.id\nWHERE d.display_name ILIKE '%sales%'\n  AND NOT EXISTS (SELECT 1 FROM department_modules ex WHERE ex.department_id = d.id AND ex.module_key = 'by_office')\nLIMIT 1

\n\n-- Grant access via role_module_access\nDO $$\nDECLARE\n  v_role_id uuid

\n  v_module_id uuid

\n  v_org_id uuid

\nBEGIN\n  SELECT organization_id INTO v_org_id FROM department_modules WHERE module_key = 'by_office' LIMIT 1

\n  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'by_office' LIMIT 1

\n\n  -- admin\n  SELECT id INTO v_role_id FROM roles WHERE role_key = 'admin'

\n  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id)\n  VALUES (v_role_id, v_module_id, true, v_org_id)\n  ON CONFLICT (role_id, module_id) DO UPDATE SET has_access = true

\n\n  -- manager\n  SELECT id INTO v_role_id FROM roles WHERE role_key = 'manager'

\n  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id)\n  VALUES (v_role_id, v_module_id, true, v_org_id)\n  ON CONFLICT (role_id, module_id) DO UPDATE SET has_access = true

\n\n  -- sales\n  SELECT id INTO v_role_id FROM roles WHERE role_key = 'sales'

\n  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id)\n  VALUES (v_role_id, v_module_id, true, v_org_id)\n  ON CONFLICT (role_id, module_id) DO UPDATE SET has_access = true

\nEND $$

\n
