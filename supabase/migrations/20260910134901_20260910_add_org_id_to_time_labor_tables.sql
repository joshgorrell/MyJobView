/*
# Add Organization ID and Tenant-Scoped RLS to Six Time/Labor Tables

## Purpose
Six timekeeping and labor tables currently lack `organization_id`, meaning they
are not tenant-scoped. This migration adds the column, backfills existing records,
and updates RLS policies to enforce organization isolation while preserving the
existing role-based access controls.

## Tables Modified
1. `internal_time_sessions` — shop/training time sessions (1 existing row)
2. `labor_categories` — labor classification types (3 existing rows)
3. `time_entry_import_history` — CSV import records (45 existing rows)
4. `time_entry_import_profiles` — CSV import profile templates (0 existing rows)
5. `labor_phase_mapping_audit` — labor phase audit trail (0 existing rows)
6. `labor_phase_performance_mapping` — labor phase performance mappings (5 existing rows)

## Backfill Strategy
- Derive organization_id from existing relationships where possible:
  - internal_time_sessions: from assigned_to -> profiles.organization_id
  - labor_phase_mapping_audit / labor_phase_performance_mapping: from labor_phase_id -> labor_phases.organization_id
  - time_entry_import_history: from imported_by -> profiles.organization_id
  - labor_categories: no FK relationship to derive org; use Electronic Life org as fallback
  - time_entry_import_profiles: 0 rows, no backfill needed
- Electronic Life org ID (b324e4e3-cd2e-4c68-8df8-3e27c7e08f15) is used ONLY as a
  fallback for verified legacy single-tenant records that have no derivable relationship.
  It never appears in runtime code, defaults, or functions.

## Security Changes
- All six tables already have RLS enabled. Existing role-based policies are preserved
  but now additionally require `organization_id = get_user_org_id()`.
- This means a user must BOTH have the correct role AND be in the same organization
  to access records.
- organization_id defaults to get_user_org_id() so new inserts are automatically scoped.
*/

-- =========================================================
-- 1. internal_time_sessions
-- =========================================================
ALTER TABLE internal_time_sessions
  ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Backfill: derive from assigned_to -> profiles.organization_id
UPDATE internal_time_sessions its
  SET organization_id = p.organization_id
  FROM profiles p
  WHERE its.assigned_to = p.id
    AND its.organization_id IS NULL;

-- Fallback for any remaining nulls (verified legacy single-tenant records)
UPDATE internal_time_sessions
  SET organization_id = 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'
  WHERE organization_id IS NULL;

-- Set NOT NULL with default
ALTER TABLE internal_time_sessions
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT get_user_org_id();

-- Add FK constraint
ALTER TABLE internal_time_sessions
  DROP CONSTRAINT IF EXISTS internal_time_sessions_organization_id_fkey;
ALTER TABLE internal_time_sessions
  ADD CONSTRAINT internal_time_sessions_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- Create index
CREATE INDEX IF NOT EXISTS idx_internal_time_sessions_org_id
  ON internal_time_sessions(organization_id);

-- Update policies: drop existing and recreate with org scoping
DROP POLICY IF EXISTS "Admins and managers can view all internal sessions" ON internal_time_sessions;
DROP POLICY IF EXISTS "Admins and managers can create internal sessions" ON internal_time_sessions;
DROP POLICY IF EXISTS "Admins and managers can update internal sessions" ON internal_time_sessions;
DROP POLICY IF EXISTS "Technicians can request their own internal sessions" ON internal_time_sessions;
DROP POLICY IF EXISTS "Technicians can cancel their own pending requests" ON internal_time_sessions;
DROP POLICY IF EXISTS "Admins can delete internal sessions" ON internal_time_sessions;
DROP POLICY IF EXISTS "Employees can delete their own pending or denied requests" ON internal_time_sessions;

CREATE POLICY "its_select_same_org" ON internal_time_sessions FOR SELECT
  TO authenticated USING (
    organization_id = get_user_org_id()
    AND (
      EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','manager','service_manager','office_manager','dispatch'))
      OR assigned_to = auth.uid()
    )
  );

CREATE POLICY "its_insert_same_org" ON internal_time_sessions FOR INSERT
  TO authenticated WITH CHECK (
    organization_id = get_user_org_id()
    AND (
      EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','manager','service_manager','office_manager'))
      OR (assigned_to = auth.uid() AND requested_by = auth.uid() AND status = 'pending_approval')
    )
  );

CREATE POLICY "its_update_same_org" ON internal_time_sessions FOR UPDATE
  TO authenticated USING (
    organization_id = get_user_org_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','manager','service_manager','office_manager'))
  )
  WITH CHECK (
    organization_id = get_user_org_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','manager','service_manager','office_manager'))
  );

-- Technicians can cancel their own pending requests (within same org)
CREATE POLICY "its_update_own_cancel_same_org" ON internal_time_sessions FOR UPDATE
  TO authenticated USING (
    organization_id = get_user_org_id()
    AND assigned_to = auth.uid()
    AND requested_by = auth.uid()
    AND status = 'pending_approval'
  )
  WITH CHECK (
    organization_id = get_user_org_id()
    AND assigned_to = auth.uid()
    AND requested_by = auth.uid()
    AND status = 'cancelled'
  );

CREATE POLICY "its_delete_admin_same_org" ON internal_time_sessions FOR DELETE
  TO authenticated USING (
    organization_id = get_user_org_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "its_delete_own_same_org" ON internal_time_sessions FOR DELETE
  TO authenticated USING (
    organization_id = get_user_org_id()
    AND requested_by = auth.uid()
    AND status IN ('pending_approval','denied')
  );

-- =========================================================
-- 2. labor_categories
-- =========================================================
ALTER TABLE labor_categories
  ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Backfill: no FK to derive org from; use Electronic Life as verified legacy fallback
UPDATE labor_categories
  SET organization_id = 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'
  WHERE organization_id IS NULL;

ALTER TABLE labor_categories
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT get_user_org_id();

ALTER TABLE labor_categories
  DROP CONSTRAINT IF EXISTS labor_categories_organization_id_fkey;
ALTER TABLE labor_categories
  ADD CONSTRAINT labor_categories_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_labor_categories_org_id
  ON labor_categories(organization_id);

-- Update policies
DROP POLICY IF EXISTS "Admins can manage labor categories" ON labor_categories;
DROP POLICY IF EXISTS "All authenticated users can view labor categories" ON labor_categories;

CREATE POLICY "labor_categories_select_same_org" ON labor_categories FOR SELECT
  TO authenticated USING (organization_id = get_user_org_id());

CREATE POLICY "labor_categories_insert_same_org" ON labor_categories FOR INSERT
  TO authenticated WITH CHECK (
    organization_id = get_user_org_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "labor_categories_update_same_org" ON labor_categories FOR UPDATE
  TO authenticated USING (
    organization_id = get_user_org_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    organization_id = get_user_org_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "labor_categories_delete_same_org" ON labor_categories FOR DELETE
  TO authenticated USING (
    organization_id = get_user_org_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- =========================================================
-- 3. time_entry_import_history
-- =========================================================
ALTER TABLE time_entry_import_history
  ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Backfill: derive from imported_by -> profiles.organization_id
UPDATE time_entry_import_history tih
  SET organization_id = p.organization_id
  FROM profiles p
  WHERE tih.imported_by = p.id
    AND tih.organization_id IS NULL;

-- Fallback for any remaining nulls
UPDATE time_entry_import_history
  SET organization_id = 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'
  WHERE organization_id IS NULL;

ALTER TABLE time_entry_import_history
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT get_user_org_id();

ALTER TABLE time_entry_import_history
  DROP CONSTRAINT IF EXISTS time_entry_import_history_organization_id_fkey;
ALTER TABLE time_entry_import_history
  ADD CONSTRAINT time_entry_import_history_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_time_entry_import_history_org_id
  ON time_entry_import_history(organization_id);

-- Update policies
DROP POLICY IF EXISTS "Users can create import history" ON time_entry_import_history;
DROP POLICY IF EXISTS "Users can view own import history" ON time_entry_import_history;
DROP POLICY IF EXISTS "Users can update own import history" ON time_entry_import_history;

CREATE POLICY "tih_select_same_org" ON time_entry_import_history FOR SELECT
  TO authenticated USING (
    organization_id = get_user_org_id()
    AND (
      imported_by = auth.uid()
      OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','production_manager','dispatch'))
    )
  );

CREATE POLICY "tih_insert_same_org" ON time_entry_import_history FOR INSERT
  TO authenticated WITH CHECK (
    organization_id = get_user_org_id()
    AND imported_by = auth.uid()
  );

CREATE POLICY "tih_update_same_org" ON time_entry_import_history FOR UPDATE
  TO authenticated USING (
    organization_id = get_user_org_id()
    AND (imported_by = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  )
  WITH CHECK (
    organization_id = get_user_org_id()
    AND (imported_by = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  );

-- =========================================================
-- 4. time_entry_import_profiles
-- =========================================================
ALTER TABLE time_entry_import_profiles
  ADD COLUMN IF NOT EXISTS organization_id uuid;

-- 0 rows, no backfill needed, but set default for future inserts
ALTER TABLE time_entry_import_profiles
  ALTER COLUMN organization_id SET DEFAULT get_user_org_id();

-- Add FK (nullable for now since 0 rows exist)
ALTER TABLE time_entry_import_profiles
  DROP CONSTRAINT IF EXISTS time_entry_import_profiles_organization_id_fkey;
ALTER TABLE time_entry_import_profiles
  ADD CONSTRAINT time_entry_import_profiles_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_time_entry_import_profiles_org_id
  ON time_entry_import_profiles(organization_id);

-- Update policies
DROP POLICY IF EXISTS "Users can delete own profiles" ON time_entry_import_profiles;
DROP POLICY IF EXISTS "Users can create own profiles" ON time_entry_import_profiles;
DROP POLICY IF EXISTS "Users can view own and shared profiles" ON time_entry_import_profiles;
DROP POLICY IF EXISTS "Users can update own profiles" ON time_entry_import_profiles;

CREATE POLICY "teip_select_same_org" ON time_entry_import_profiles FOR SELECT
  TO authenticated USING (
    organization_id = get_user_org_id()
    AND (created_by = auth.uid() OR is_shared = true)
  );

CREATE POLICY "teip_insert_same_org" ON time_entry_import_profiles FOR INSERT
  TO authenticated WITH CHECK (
    organization_id = get_user_org_id()
    AND created_by = auth.uid()
  );

CREATE POLICY "teip_update_same_org" ON time_entry_import_profiles FOR UPDATE
  TO authenticated USING (
    organization_id = get_user_org_id()
    AND created_by = auth.uid()
  )
  WITH CHECK (
    organization_id = get_user_org_id()
    AND created_by = auth.uid()
  );

CREATE POLICY "teip_delete_same_org" ON time_entry_import_profiles FOR DELETE
  TO authenticated USING (
    organization_id = get_user_org_id()
    AND created_by = auth.uid()
  );

-- =========================================================
-- 5. labor_phase_mapping_audit
-- =========================================================
ALTER TABLE labor_phase_mapping_audit
  ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Backfill: derive from labor_phase_id -> labor_phases.organization_id
UPDATE labor_phase_mapping_audit lpma
  SET organization_id = lp.organization_id
  FROM labor_phases lp
  WHERE lpma.labor_phase_id = lp.id
    AND lpma.organization_id IS NULL;

-- Fallback
UPDATE labor_phase_mapping_audit
  SET organization_id = 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'
  WHERE organization_id IS NULL;

ALTER TABLE labor_phase_mapping_audit
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT get_user_org_id();

ALTER TABLE labor_phase_mapping_audit
  DROP CONSTRAINT IF EXISTS labor_phase_mapping_audit_organization_id_fkey;
ALTER TABLE labor_phase_mapping_audit
  ADD CONSTRAINT labor_phase_mapping_audit_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_labor_phase_mapping_audit_org_id
  ON labor_phase_mapping_audit(organization_id);

-- Update policies
DROP POLICY IF EXISTS "Only admins can insert audit records" ON labor_phase_mapping_audit;
DROP POLICY IF EXISTS "All authenticated users can view mapping audit trail" ON labor_phase_mapping_audit;

CREATE POLICY "lpma_select_same_org" ON labor_phase_mapping_audit FOR SELECT
  TO authenticated USING (organization_id = get_user_org_id());

CREATE POLICY "lpma_insert_same_org" ON labor_phase_mapping_audit FOR INSERT
  TO authenticated WITH CHECK (
    organization_id = get_user_org_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner'))
  );

-- =========================================================
-- 6. labor_phase_performance_mapping
-- =========================================================
ALTER TABLE labor_phase_performance_mapping
  ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Backfill: derive from labor_phase_id -> labor_phases.organization_id
UPDATE labor_phase_performance_mapping lppm
  SET organization_id = lp.organization_id
  FROM labor_phases lp
  WHERE lppm.labor_phase_id = lp.id
    AND lppm.organization_id IS NULL;

-- Fallback
UPDATE labor_phase_performance_mapping
  SET organization_id = 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'
  WHERE organization_id IS NULL;

ALTER TABLE labor_phase_performance_mapping
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT get_user_org_id();

ALTER TABLE labor_phase_performance_mapping
  DROP CONSTRAINT IF EXISTS labor_phase_performance_mapping_organization_id_fkey;
ALTER TABLE labor_phase_performance_mapping
  ADD CONSTRAINT labor_phase_performance_mapping_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_labor_phase_performance_mapping_org_id
  ON labor_phase_performance_mapping(organization_id);

-- Update policies
DROP POLICY IF EXISTS "Only admins can insert labor phase mappings" ON labor_phase_performance_mapping;
DROP POLICY IF EXISTS "All authenticated users can view labor phase mappings" ON labor_phase_performance_mapping;
DROP POLICY IF EXISTS "Only admins can update labor phase mappings" ON labor_phase_performance_mapping;

CREATE POLICY "lppm_select_same_org" ON labor_phase_performance_mapping FOR SELECT
  TO authenticated USING (organization_id = get_user_org_id());

CREATE POLICY "lppm_insert_same_org" ON labor_phase_performance_mapping FOR INSERT
  TO authenticated WITH CHECK (
    organization_id = get_user_org_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner'))
  );

CREATE POLICY "lppm_update_same_org" ON labor_phase_performance_mapping FOR UPDATE
  TO authenticated USING (
    organization_id = get_user_org_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner'))
  )
  WITH CHECK (
    organization_id = get_user_org_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner'))
  );
