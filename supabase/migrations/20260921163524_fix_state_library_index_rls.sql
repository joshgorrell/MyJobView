/*
# Fix state_library_index RLS policies

## Problem
The original migration created INSERT and UPDATE policies with
USING (true) / WITH CHECK (true), allowing ANY authenticated user
to modify global MJV library metadata. This does not match the
approved architecture: state_library_index is global reference data
that only platform-level MJV admins should modify.

## Fix
Replace the permissive INSERT and UPDATE policies with ones that
check is_global_admin(), matching the existing pattern used by
master_classifications and master_state_tax_rules.

## Existing Pattern
- master_classifications: SELECT TO authenticated USING (true);
  ALL TO authenticated USING (is_global_admin()) WITH CHECK (is_global_admin())
- master_state_tax_rules: SELECT TO authenticated USING (true);
  INSERT/UPDATE/DELETE TO authenticated USING/CHECK (is_global_admin())

## Corrected Policies
- SELECT: authenticated (unchanged - all authenticated users can read)
- INSERT: authenticated WITH CHECK (is_global_admin())
- UPDATE: authenticated USING (is_global_admin()) WITH CHECK (is_global_admin())
- No DELETE policy (reference data should not be deleted)
*/

-- Drop the permissive policies
DROP POLICY IF EXISTS "insert_state_library_index" ON state_library_index;
DROP POLICY IF EXISTS "update_state_library_index" ON state_library_index;

-- Create restricted policies matching the master_classifications pattern
CREATE POLICY "global_admins_can_insert_state_library_index"
  ON state_library_index FOR INSERT
  TO authenticated
  WITH CHECK (is_global_admin());

CREATE POLICY "global_admins_can_update_state_library_index"
  ON state_library_index FOR UPDATE
  TO authenticated
  USING (is_global_admin()) WITH CHECK (is_global_admin());
