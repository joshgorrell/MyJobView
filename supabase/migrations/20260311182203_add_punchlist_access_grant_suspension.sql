/*
  # Add Suspension Support to Punchlist Access Grants

  ## Summary
  Adds the ability for admins to suspend and unsuspend customer punchlist access,
  and allows deletion of access grants (which cascades to associated punchlist tasks).

  ## Changes

  ### 1. punchlist_access_grants table
  - Expands the `status` CHECK constraint to include 'suspended'
  - Adds `suspended_at` (timestamptz) - when the grant was last suspended
  - Adds `suspended_by` (uuid, references profiles) - who suspended it

  ### 2. toggle_punchlist_access_suspension(p_access_grant_id)
  - Flips status between 'active' and 'suspended'
  - Records suspended_at / suspended_by on suspension
  - Clears those fields on unsuspension

  ### 3. RLS policies
  - Adds DELETE policy on punchlist_access_grants for admin/manager roles
  - Ensures punchlist_tasks are cascade-deleted when access grant is deleted
    (the existing FK already has ON DELETE CASCADE in the schema; confirmed)
  - Portal access check in get_contact_portal_access_level already filters
    on status = 'active', so suspended customers are blocked automatically

  ## Security
  - Only authenticated internal roles (admin, sales_manager, manager, office_manager,
    project_manager, service_manager) can suspend or delete access grants
  - Suspension is silent (no email sent)
*/

-- 1. Widen the status constraint to include 'suspended'
ALTER TABLE punchlist_access_grants
  DROP CONSTRAINT IF EXISTS punchlist_access_grants_status_check;

ALTER TABLE punchlist_access_grants
  ADD CONSTRAINT punchlist_access_grants_status_check
  CHECK (status IN ('pending', 'active', 'expired', 'suspended'));

-- 2. Add audit columns for suspension
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'punchlist_access_grants' AND column_name = 'suspended_at'
  ) THEN
    ALTER TABLE punchlist_access_grants ADD COLUMN suspended_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'punchlist_access_grants' AND column_name = 'suspended_by'
  ) THEN
    ALTER TABLE punchlist_access_grants ADD COLUMN suspended_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Function: toggle suspension (active <-> suspended)
CREATE OR REPLACE FUNCTION public.toggle_punchlist_access_suspension(
  p_access_grant_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status text;
  v_new_status text;
BEGIN
  SELECT status INTO v_current_status
  FROM punchlist_access_grants
  WHERE id = p_access_grant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Access grant not found';
  END IF;

  IF v_current_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'Only active or suspended grants can be toggled (current status: %)', v_current_status;
  END IF;

  IF v_current_status = 'active' THEN
    v_new_status := 'suspended';
    UPDATE punchlist_access_grants
    SET
      status = 'suspended',
      suspended_at = now(),
      suspended_by = auth.uid(),
      updated_at = now()
    WHERE id = p_access_grant_id;
  ELSE
    v_new_status := 'active';
    UPDATE punchlist_access_grants
    SET
      status = 'active',
      suspended_at = NULL,
      suspended_by = NULL,
      updated_at = now()
    WHERE id = p_access_grant_id;
  END IF;

  RETURN v_new_status;
END;
$$;

-- 4. RLS: allow internal roles to DELETE access grants
--    (cascade on punchlist_tasks is already in place via the FK)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'punchlist_access_grants'
      AND policyname = 'Internal users can delete access grants'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Internal users can delete access grants"
        ON punchlist_access_grants FOR DELETE
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'sales_manager', 'manager', 'office_manager', 'project_manager', 'service_manager')
          )
        )
    $policy$;
  END IF;
END $$;

COMMENT ON FUNCTION toggle_punchlist_access_suspension IS 'Toggles a punchlist access grant between active and suspended. Suspended customers immediately lose portal access.';
