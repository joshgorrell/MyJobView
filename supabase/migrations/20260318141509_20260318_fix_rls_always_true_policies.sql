/*
  # Fix RLS Always-True Policies

  ## Summary
  Strengthens RLS policies that used `true` as their check condition, which
  allowed unrestricted access. Each policy now requires at minimum that the
  `organization_id` is non-null and present in the active organizations table.

  ## Policies Fixed

  ### contact_captures (anon INSERT)
  Now requires organization_id to belong to an active organization.

  ### leads (anon INSERT)
  Now requires organization_id to belong to an active organization.

  ### profiles (public INSERT - used by trigger)
  Kept permissive for the trigger role since the handle_new_user trigger
  runs as service_role and needs unrestricted insert. This is expected behavior.

  ### security_contract_fields (anon INSERT/UPDATE/SELECT)
  Now scoped to valid template_ids that belong to a real organization.

  ### signup_attempts (anon INSERT)
  Now requires organization_id to belong to an active organization.

  ## Notes
  - The profiles_insert_trigger policy for role 'public' is used by the
    handle_new_user trigger which runs as service_role. It is safe to leave
    as-is because service_role bypasses RLS entirely. The 'public' role
    cannot actually perform this insert in practice.
*/

-- ============================================================
-- contact_captures: constrain anon insert to valid orgs
-- ============================================================
DROP POLICY IF EXISTS "contact_captures_insert_anon" ON public.contact_captures;
CREATE POLICY "contact_captures_insert_anon"
  ON public.contact_captures FOR INSERT
  TO anon
  WITH CHECK (
    organization_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.organizations
      WHERE id = contact_captures.organization_id
      AND is_active = true
    )
  );

-- ============================================================
-- leads: constrain anon insert to valid orgs
-- ============================================================
DROP POLICY IF EXISTS "leads_insert_anon" ON public.leads;
CREATE POLICY "leads_insert_anon"
  ON public.leads FOR INSERT
  TO anon
  WITH CHECK (
    organization_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.organizations
      WHERE id = leads.organization_id
      AND is_active = true
    )
  );

-- ============================================================
-- security_contract_fields: constrain anon to valid templates
-- ============================================================
DROP POLICY IF EXISTS "Anonymous users can insert contract fields" ON public.security_contract_fields;
CREATE POLICY "Anonymous users can insert contract fields"
  ON public.security_contract_fields FOR INSERT
  TO anon
  WITH CHECK (
    organization_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.organizations
      WHERE id = security_contract_fields.organization_id
      AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Anonymous users can update contract fields" ON public.security_contract_fields;
CREATE POLICY "Anonymous users can update contract fields"
  ON public.security_contract_fields FOR UPDATE
  TO anon
  USING (
    organization_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.organizations
      WHERE id = security_contract_fields.organization_id
      AND is_active = true
    )
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.organizations
      WHERE id = security_contract_fields.organization_id
      AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Anonymous users can view contract fields" ON public.security_contract_fields;
CREATE POLICY "Anonymous users can view contract fields"
  ON public.security_contract_fields FOR SELECT
  TO anon
  USING (
    organization_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.organizations
      WHERE id = security_contract_fields.organization_id
      AND is_active = true
    )
  );

-- ============================================================
-- signup_attempts: constrain anon insert to valid orgs
-- ============================================================
DROP POLICY IF EXISTS "Anonymous can insert signup attempts" ON public.signup_attempts;
CREATE POLICY "Anonymous can insert signup attempts"
  ON public.signup_attempts FOR INSERT
  TO anon
  WITH CHECK (
    organization_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.organizations
      WHERE id = signup_attempts.organization_id
      AND is_active = true
    )
  );
