/*
  # Add Rewards Dashboard Module - Default ON for All Roles

  ## Summary
  Inserts the `rewards_dashboard` module into the pipeline department and grants
  access to every active role by default. Every new user will see the Rewards
  Dashboard automatically. An admin can revoke access for any individual user at
  any time via the Individual Pages tab in User Access Control.

  ## Changes
  1. New module record in `department_modules`:
     - module_key: rewards_dashboard
     - display_name: Rewards Dashboard
     - icon: Trophy
     - description: View points balance, earned rewards, and redemption history
     - Placed in the pipeline department at sort_order 11 (after Team Pulse)

  2. `role_module_access` rows with `has_access = true` for all active roles:
     - admin, finance, manager, sales, service_manager, tech

  ## Notes
  - User-level overrides (user_permission_overrides) take priority over role
    access, so revoking per user continues to work immediately.
*/

DO $$
DECLARE
  v_module_id uuid;
  v_pipeline_dept_id uuid := 'a182b381-76e6-43fe-b920-20bc7666112b';
  v_org_id uuid := 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15';
BEGIN
  INSERT INTO department_modules (organization_id, department_id, module_key, display_name, icon, description, sort_order, is_active)
  VALUES (
    v_org_id,
    v_pipeline_dept_id,
    'rewards_dashboard',
    'Rewards Dashboard',
    'Trophy',
    'View points balance, earned rewards, and redemption history',
    11,
    true
  )
  ON CONFLICT (department_id, module_key) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'rewards_dashboard';

  INSERT INTO role_module_access (organization_id, role_id, module_id, has_access)
  SELECT v_org_id, r.id, v_module_id, true
  FROM roles r
  WHERE r.is_active = true
  ON CONFLICT (role_id, module_id) DO UPDATE SET has_access = true;
END $$;
