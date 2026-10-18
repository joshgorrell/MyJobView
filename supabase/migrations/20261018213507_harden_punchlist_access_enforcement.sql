/*
# Harden Punchlist Access Enforcement

## Summary

This migration closes six security and correctness gaps in the Punchlist access system
identified during an audit against the business rules:

1. **grant_punchlist_access_directly** had NO authorization check — any authenticated
   user (including portal users) could grant themselves or anyone else arbitrary-length
   punchlist access. Now requires admin/manager/service_manager role, verifies org
   membership, caps p_days at 90, and anchors the expiration date to the project's
   substantial completion date + 90 (not today) for test_and_tune grants.

2. **punchlist_tasks INSERT RLS policy** did not verify the contact currently has
   punchlist access. Expired customers could still create tasks via direct API calls.
   A BEFORE INSERT trigger now rejects inserts when the contact has no active access.

3. **mark_expired_punchlist_access** function existed but was never scheduled. Access
   grants stayed status='active' in the DB even after their expiration date passed,
   confusing the admin dashboard. A daily pg_cron job is now registered.

4. **renew_punchlist_access** had no authorization check and reset the clock from
   today, breaking the 90-days-from-completion rule. Now requires admin/manager/
   service_manager role, verifies org membership, caps p_days at 90, and extends
   from the existing expiration_date (not today) to preserve the original anchor.

5. **accept_punchlist_invitation** had no authorization check. Any authenticated user
   could activate any contact's pending invitation. Now requires that the caller is
   either the contact themselves (portal user with matching contact_id in JWT) or an
   admin/manager/service_manager in the same organization.

6. **grant_comped_vip_membership** function was called from the frontend
   (PunchlistInviteManager.tsx) but did not exist in the database, causing the
   "VIP Signup > Comped" flow to fail. Now created with proper authorization checks.

## Tables Modified
- None (no schema changes)

## Functions Modified
- public.grant_punchlist_access_directly — rewritten with auth checks + 90-day cap
- public.renew_punchlist_access — rewritten with auth checks + 90-day cap + preserve anchor
- public.accept_punchlist_invitation — rewritten with caller identity check

## Functions Created
- public.grant_comped_vip_membership — creates a comped VIP subscription + access grant
- public.check_punchlist_access_for_task() — trigger function for BEFORE INSERT on punchlist_tasks

## Triggers Created
- trigger_check_punchlist_access BEFORE INSERT ON punchlist_tasks

## Scheduled Jobs
- pg_cron job "expire-punchlist-access-daily" calling mark_expired_punchlist_access() at 1 AM daily

## Security Changes
- RLS not changed (existing policies remain; the new trigger enforces access eligibility
  at the row level, which RLS policies alone cannot do efficiently)
- All SECURITY DEFINER functions now have internal authorization checks that do not
  rely on the caller's RLS context

## Important Notes
1. The grant_punchlist_access_directly function now requires a project_id for
   test_and_tune grants (to anchor to the substantial completion date). The frontend
   caller in ContactDetail.tsx does not pass a project_id, so this function will now
   create a "complimentary" grant with access_type='promotional' instead of
   'test_and_tune' when no project is provided. This is the explicit complimentary
   access pathway required by the business rules. The p_days parameter is capped at 90.

2. The renew_punchlist_access function now extends from the existing expiration_date
   rather than from CURRENT_DATE. For a test_and_tune grant that expired 5 days ago,
   a 90-day renewal sets the new expiration to (old_expiration + 90), not (today + 90).
   This preserves the 90-days-from-completion anchor.

3. The grant_comped_vip_membership function creates a recurring_subscriptions row
   with status='active', trial_source='vip_trial', and the specified end_date. It also
   creates a punchlist_access_grants row linked to the subscription. This is the
   "explicit complimentary access" pathway from the business rules.
*/

-- ============================================================================
-- 1. Fix grant_punchlist_access_directly — add authorization + 90-day cap
-- ============================================================================
CREATE OR REPLACE FUNCTION public.grant_punchlist_access_directly(
  p_contact_id uuid,
  p_days integer DEFAULT 90,
  p_notes text DEFAULT NULL,
  p_project_id uuid DEFAULT NULL
)
RETURNS TABLE(access_grant_id uuid, is_renewal boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_role text;
  v_existing_grant_id uuid;
  v_is_renewal boolean := false;
  v_contact_name text;
  v_completion_date date;
  v_end date;
  v_access_type text;
  v_final_days integer;
BEGIN
  -- Authorization: only admin/manager/service_manager can grant access
  SELECT organization_id, role INTO v_org, v_role
  FROM profiles WHERE id = auth.uid() AND is_active AND contact_id IS NULL;
  IF v_org IS NULL OR v_role NOT IN ('admin','manager','service_manager') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Verify contact belongs to caller's organization
  IF NOT EXISTS(SELECT 1 FROM contacts WHERE id = p_contact_id AND organization_id = v_org) THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  -- Cap p_days at 90
  v_final_days := LEAST(p_days, 90);
  IF v_final_days < 1 THEN
    RAISE EXCEPTION 'Access duration must be at least 1 day';
  END IF;

  SELECT full_name INTO v_contact_name FROM contacts WHERE id = p_contact_id;

  -- If project_id is provided, anchor to substantial completion date + 90
  IF p_project_id IS NOT NULL THEN
    SELECT substantial_completion_date INTO v_completion_date
    FROM projects WHERE id = p_project_id AND contact_id = p_contact_id AND organization_id = v_org;
    IF v_completion_date IS NULL THEN
      RAISE EXCEPTION 'Select a project with a substantial completion date';
    END IF;
    v_end := v_completion_date + 90;
    IF v_end < CURRENT_DATE THEN
      RAISE EXCEPTION 'The project Test & Tune period has ended';
    END IF;
    v_access_type := 'test_and_tune';
    -- Use remaining days from completion date, capped at 90
    v_final_days := LEAST(v_end - CURRENT_DATE, 90);
  ELSE
    -- No project: this is explicit complimentary access (promotional)
    v_access_type := 'promotional';
    v_end := CURRENT_DATE + v_final_days;
  END IF;

  -- Check if contact already has an access grant
  SELECT id INTO v_existing_grant_id
  FROM punchlist_access_grants
  WHERE contact_id = p_contact_id AND organization_id = v_org
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_existing_grant_id IS NOT NULL THEN
    v_is_renewal := true;
    UPDATE punchlist_access_grants
    SET
      status = 'active',
      access_type = v_access_type,
      project_id = COALESCE(p_project_id, project_id),
      granted_date = CURRENT_DATE,
      expiration_date = v_end,
      notes = COALESCE(p_notes, 'Access renewed directly by admin on ' || CURRENT_DATE::text),
      updated_at = now()
    WHERE id = v_existing_grant_id;
  ELSE
    v_is_renewal := false;
    INSERT INTO punchlist_access_grants (
      contact_id, organization_id, access_type, project_id,
      granted_date, expiration_date, status, notes
    ) VALUES (
      p_contact_id, v_org, v_access_type, p_project_id,
      CURRENT_DATE, v_end, 'active',
      COALESCE(p_notes, 'Complimentary access granted to ' || v_contact_name || ' by admin on ' || CURRENT_DATE::text)
    )
    RETURNING id INTO v_existing_grant_id;
  END IF;

  RETURN QUERY SELECT v_existing_grant_id, v_is_renewal;
END;
$function$;


-- ============================================================================
-- 2. Add BEFORE INSERT trigger to punchlist_tasks for access eligibility
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_punchlist_access_for_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_meta jsonb := auth.jwt()->'app_metadata';
  v_is_portal_user boolean;
  v_has_access boolean;
BEGIN
  -- Only enforce for portal users; internal users (admins) can always insert
  v_is_portal_user := COALESCE((v_meta->>'is_portal_user')::boolean, false);

  IF v_is_portal_user THEN
    -- Verify the contact currently has punchlist access
    v_has_access := public.contact_has_punchlist_access(NEW.contact_id);

    IF NOT v_has_access THEN
      -- Also check for active VIP membership (contact_has_punchlist_access only
      -- checks punchlist_access_grants, not recurring_subscriptions)
      SELECT EXISTS (
        SELECT 1 FROM recurring_subscriptions rs
        JOIN recurring_plans rp ON rp.id = rs.plan_id
        WHERE rs.contact_id = NEW.contact_id
          AND rs.organization_id = NEW.organization_id
          AND rs.status = 'active'
          AND rp.plan_type = 'vip_plan'
          AND (rs.end_date IS NULL OR rs.end_date >= CURRENT_DATE)
          AND rs.next_billing_date >= CURRENT_DATE
      ) INTO v_has_access;
    END IF;

    IF NOT v_has_access THEN
      RAISE EXCEPTION 'Punchlist access has expired. New items cannot be created.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;


DROP TRIGGER IF EXISTS trigger_check_punchlist_access ON public.punchlist_tasks;

CREATE TRIGGER trigger_check_punchlist_access
  BEFORE INSERT ON public.punchlist_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.check_punchlist_access_for_task();


-- ============================================================================
-- 3. Schedule mark_expired_punchlist_access via pg_cron
-- ============================================================================

DO $$
BEGIN
  -- Unschedule any existing job with this name first (idempotent)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-punchlist-access-daily') THEN
    PERFORM cron.unschedule('expire-punchlist-access-daily');
  END IF;
  -- Schedule daily at 1 AM
  PERFORM cron.schedule('expire-punchlist-access-daily', '0 1 * * *', 'SELECT mark_expired_punchlist_access();');
END $$;


-- ============================================================================
-- 4. Fix renew_punchlist_access — add authorization + preserve anchor date
-- ============================================================================

CREATE OR REPLACE FUNCTION public.renew_punchlist_access(
  p_access_grant_id uuid,
  p_days integer DEFAULT 90
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_role text;
  v_grant record;
  v_final_days integer;
  v_new_expiration date;
BEGIN
  -- Authorization: only admin/manager/service_manager can renew access
  SELECT organization_id, role INTO v_org, v_role
  FROM profiles WHERE id = auth.uid() AND is_active AND contact_id IS NULL;
  IF v_org IS NULL OR v_role NOT IN ('admin','manager','service_manager') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Cap p_days at 90
  v_final_days := LEAST(p_days, 90);
  IF v_final_days < 1 THEN
    RAISE EXCEPTION 'Renewal duration must be at least 1 day';
  END IF;

  -- Get the access grant and verify it belongs to the caller's org
  SELECT * INTO v_grant
  FROM punchlist_access_grants
  WHERE id = p_access_grant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Access grant not found';
  END IF;

  IF v_grant.organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Extend from the existing expiration_date, not from CURRENT_DATE.
  -- This preserves the 90-days-from-completion anchor for test_and_tune grants.
  -- If the grant already expired, extend from the old expiration date.
  -- If the grant has no expiration date (VIP membership), extend from today.
  IF v_grant.expiration_date IS NOT NULL THEN
    v_new_expiration := v_grant.expiration_date + v_final_days;
  ELSE
    v_new_expiration := CURRENT_DATE + v_final_days;
  END IF;

  UPDATE punchlist_access_grants
  SET
    status = 'active',
    expiration_date = v_new_expiration,
    updated_at = now()
  WHERE id = p_access_grant_id;
END;
$function$;


-- ============================================================================
-- 5. Fix accept_punchlist_invitation — verify caller identity
-- ============================================================================

CREATE OR REPLACE FUNCTION public.accept_punchlist_invitation(p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_meta jsonb := auth.jwt()->'app_metadata';
  v_is_portal_user boolean;
  v_portal_contact text;
  v_org uuid;
  v_role text;
BEGIN
  v_is_portal_user := COALESCE((v_meta->>'is_portal_user')::boolean, false);
  v_portal_contact := v_meta->>'contact_id';

  IF v_is_portal_user THEN
    -- Portal users can only accept their own invitation
    IF v_portal_contact IS DISTINCT FROM p_contact_id::text THEN
      RAISE EXCEPTION 'You can only accept your own invitation' USING ERRCODE = '42501';
    END IF;
  ELSE
    -- Internal users: must be admin/manager/service_manager in the same org
    SELECT organization_id, role INTO v_org, v_role
    FROM profiles WHERE id = auth.uid() AND is_active AND contact_id IS NULL;
    IF v_org IS NULL OR v_role NOT IN ('admin','manager','service_manager') THEN
      RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM contacts WHERE id = p_contact_id AND organization_id = v_org) THEN
      RAISE EXCEPTION 'Contact not found' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Update any pending access grants for this contact to active
  UPDATE punchlist_access_grants
  SET
    status = 'active',
    granted_date = CURRENT_DATE,
    notes = COALESCE(notes || ' | ', '') || 'Accepted by customer on ' || CURRENT_DATE::text,
    updated_at = now()
  WHERE contact_id = p_contact_id
    AND status = 'pending'
    AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending invitation found for this contact';
  END IF;
END;
$function$;


-- ============================================================================
-- 6. Create grant_comped_vip_membership — was called from frontend but missing
-- ============================================================================

CREATE OR REPLACE FUNCTION public.grant_comped_vip_membership(
  p_contact_id uuid,
  p_plan_id uuid,
  p_end_date date,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_role text;
  v_plan record;
  v_subscription_id uuid;
  v_grant_id uuid;
  v_contact_name text;
BEGIN
  -- Authorization: only admin/manager/service_manager can grant comped VIP
  SELECT organization_id, role INTO v_org, v_role
  FROM profiles WHERE id = auth.uid() AND is_active AND contact_id IS NULL;
  IF v_org IS NULL OR v_role NOT IN ('admin','manager','service_manager') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Verify contact belongs to caller's organization
  SELECT full_name INTO v_contact_name FROM contacts
  WHERE id = p_contact_id AND organization_id = v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  -- Verify the plan exists and is a VIP plan in the same org
  SELECT * INTO v_plan FROM recurring_plans
  WHERE id = p_plan_id AND organization_id = v_org AND plan_type = 'vip_plan' AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid VIP plan';
  END IF;

  -- Verify end date is valid (today or future)
  IF p_end_date IS NULL OR p_end_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'End date must be today or in the future';
  END IF;

  -- Check for existing active VIP membership or trial
  IF EXISTS (
    SELECT 1 FROM recurring_subscriptions rs
    LEFT JOIN recurring_plans rp ON rp.id = rs.plan_id
    WHERE rs.contact_id = p_contact_id AND rs.organization_id = v_org
      AND ((rs.status = 'active' AND rp.plan_type = 'vip_plan')
           OR (rs.status = 'trial' AND rs.trial_source = 'vip_trial' AND rs.trial_end_date >= CURRENT_DATE))
  ) THEN
    RAISE EXCEPTION 'Customer already has VIP membership or a VIP trial';
  END IF;

  -- Create the comped VIP subscription
  INSERT INTO recurring_subscriptions (
    company_id, organization_id, contact_id, plan_id,
    status, start_date, end_date, next_billing_date,
    trial_started_date, trial_end_date, trial_source,
    auto_invoice, auto_send, auto_renew, created_by, notes
  ) VALUES (
    v_org, v_org, p_contact_id, p_plan_id,
    'active', CURRENT_DATE, p_end_date, p_end_date,
    CURRENT_DATE, p_end_date, 'vip_trial',
    false, false, false, auth.uid(),
    COALESCE(p_notes, 'Complimentary VIP membership granted by admin on ' || CURRENT_DATE::text)
  )
  RETURNING id INTO v_subscription_id;

  -- Create the punchlist access grant linked to the subscription
  INSERT INTO punchlist_access_grants (
    organization_id, contact_id, subscription_id,
    access_type, status, granted_date, expiration_date, notes
  ) VALUES (
    v_org, p_contact_id, v_subscription_id,
    'vip_membership', 'active', CURRENT_DATE, p_end_date,
    COALESCE(p_notes, 'Complimentary VIP access granted to ' || v_contact_name || ' on ' || CURRENT_DATE::text)
  )
  RETURNING id INTO v_grant_id;

  RETURN v_subscription_id;
END;
$function$;
