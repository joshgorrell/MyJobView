/*
  # Fix Tech Role Default Starred Modules
*/
DO $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT id INTO v_org_id FROM organizations LIMIT 1;
  IF v_org_id IS NOT NULL THEN
    INSERT INTO default_starred_modules (organization_id, role, module_id, default_order)
    SELECT v_org_id, 'tech', module_id, default_order
    FROM default_starred_modules
    WHERE role = 'technician'
    ON CONFLICT (role, module_id) DO NOTHING;

    INSERT INTO module_role_access (organization_id, module_id, role, has_access)
    SELECT v_org_id, module_id, 'tech', has_access
    FROM module_role_access
    WHERE role = 'technician'
    ON CONFLICT (module_id, role) DO UPDATE SET has_access = EXCLUDED.has_access;
  END IF;
END $$;