
-- Replace the permissive SELECT policy on company_settings with an org-scoped one.
-- The old policy allowed any authenticated user to read every organization's settings
-- (including API keys, Twilio tokens, and other sensitive fields).
-- The new policy scopes reads to the caller's own organization via get_user_org_id().

DROP POLICY IF EXISTS "All authenticated users can read company settings" ON company_settings;

CREATE POLICY "company_settings_select_same_org"
  ON company_settings FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());
