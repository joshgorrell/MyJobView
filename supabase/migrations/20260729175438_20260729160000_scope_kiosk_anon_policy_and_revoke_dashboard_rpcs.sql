/*
  # Security Fixes
  1. Scope the kiosk anon profiles policy to active organizations only
     (previously exposed every tenant's sales reps to the public internet)
  2. REVOKE EXECUTE FROM PUBLIC on the 6 new dashboard RPC functions
     (all are SECURITY DEFINER — PUBLIC execute is a risk)
*/

-- ── 1. Fix kiosk anon profiles policy ──────────────────────────────────
-- Drop the unscoped policy that exposes all tenants' sales reps
DROP POLICY IF EXISTS "Anonymous can read active sales rep profiles for kiosk" ON profiles;

-- Recreate with organization_id scoped to active organizations only
-- The kiosk runs in a single-tenant context and queries organizations
-- with is_active = true, limit(1) — this policy matches that scope.
CREATE POLICY "Anonymous can read active sales rep profiles for kiosk"
  ON profiles
  FOR SELECT
  TO anon
  USING (
    is_active = true
    AND role IN ('sales', 'sales_manager', 'manager', 'admin')
    AND organization_id IN (
      SELECT id FROM organizations WHERE is_active = true
    )
  );

-- ── 2. REVOKE EXECUTE FROM PUBLIC on dashboard RPC functions ──────────
-- These are SECURITY DEFINER functions; PUBLIC should never have execute.
REVOKE EXECUTE ON FUNCTION get_my_sales_dashboard(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_sales_rep_dashboard(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_sales_team_dashboard(uuid[], date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_sales_goal_leaderboard(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_manager_or_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_caller_org_id(uuid) FROM PUBLIC;
