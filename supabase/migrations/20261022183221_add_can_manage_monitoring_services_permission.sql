/*
# Add "Manage Monitoring Services" permission

1. New Columns
- `profiles.can_manage_monitoring_services` (boolean, default false)
  A dedicated permission that controls who can add, edit, activate/deactivate,
  and delete monitoring services in the security catalog. Defaults to false so
  only administrators who explicitly grant it (or admins by role) can manage.

2. Security Changes
- Adds a RESTRICTIVE RLS policy on `monitoring_services` that requires the
  caller's profile to have `can_manage_monitoring_services = true` for any
  INSERT, UPDATE, or DELETE operation. SELECT remains open to all active,
  non-portal authenticated users in the same organization (unchanged).
- Admins (role = 'admin') are automatically allowed to manage monitoring
  services regardless of the flag, so they can always configure permissions.

3. Important Notes
- All dealer (internal, non-portal) users can still VIEW monitoring services.
- Only users with the permission flag or admin role can modify them.
- Portal users remain excluded from all access.
*/

-- 1. Add the permission column
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS can_manage_monitoring_services boolean DEFAULT false;

-- 2. Grant admins the ability to manage monitoring services by default
UPDATE profiles
  SET can_manage_monitoring_services = true
  WHERE role = 'admin' AND can_manage_monitoring_services IS DISTINCT FROM true;

-- 3. Drop existing write policies so we can replace them with permission-gated versions
DROP POLICY IF EXISTS "monitoring_services_insert_same_org" ON monitoring_services;
DROP POLICY IF EXISTS "monitoring_services_update_same_org" ON monitoring_services;
DROP POLICY IF EXISTS "monitoring_services_delete_same_org" ON monitoring_services;

-- 4. Create new write policies that require can_manage_monitoring_services (or admin role)
--    The existing RESTRICTIVE policy "security_monitoring_catalog_staff_scope"
--    already enforces: same org, active, non-portal. These PERMISSIVE policies
--    add the additional requirement that the user has the management permission.

CREATE POLICY "monitoring_services_insert_same_org"
  ON monitoring_services FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = monitoring_services.organization_id
        AND p.is_active = true
        AND p.role <> 'portal'
        AND COALESCE(((auth.jwt() -> 'app_metadata'::text) ->> 'is_portal_user'::text))::boolean IS DISTINCT FROM true
        AND (p.can_manage_monitoring_services = true OR p.role = 'admin')
    )
  );

CREATE POLICY "monitoring_services_update_same_org"
  ON monitoring_services FOR UPDATE
  TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = monitoring_services.organization_id
        AND p.is_active = true
        AND p.role <> 'portal'
        AND COALESCE(((auth.jwt() -> 'app_metadata'::text) ->> 'is_portal_user'::text))::boolean IS DISTINCT FROM true
        AND (p.can_manage_monitoring_services = true OR p.role = 'admin')
    )
  )
  WITH CHECK (
    organization_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = monitoring_services.organization_id
        AND p.is_active = true
        AND p.role <> 'portal'
        AND COALESCE(((auth.jwt() -> 'app_metadata'::text) ->> 'is_portal_user'::text))::boolean IS DISTINCT FROM true
        AND (p.can_manage_monitoring_services = true OR p.role = 'admin')
    )
  );

CREATE POLICY "monitoring_services_delete_same_org"
  ON monitoring_services FOR DELETE
  TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = monitoring_services.organization_id
        AND p.is_active = true
        AND p.role <> 'portal'
        AND COALESCE(((auth.jwt() -> 'app_metadata'::text) ->> 'is_portal_user'::text))::boolean IS DISTINCT FROM true
        AND (p.can_manage_monitoring_services = true OR p.role = 'admin')
    )
  );
