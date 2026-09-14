/*
# Phase 1: Fix send_punchlist_invite() to use configured T&T duration

## Problem
The send_punchlist_invite() function hardcodes INTERVAL '90 days' in three places:
1. Access grant expiration_date
2. Trial subscription next_billing_date
3. Trial subscription trial_end_date

The test_tune_settings table has a test_tune_period_days column (default 90)
that should be the source of truth for this duration.

## Change
Replace all three hardcoded INTERVAL '90 days' with
make_interval(days => COALESCE((SELECT test_tune_period_days FROM test_tune_settings LIMIT 1), 90))

## What does NOT change
- Function signature: send_punchlist_invite(p_invite_id uuid)
- SECURITY DEFINER, search_path = public
- All other logic (invite lookup, org check, duplicate check, trial creation)
- Existing grants and subscriptions are NOT retroactively changed
- The queue_punchlist_invite trigger is NOT modified
*/

CREATE OR REPLACE FUNCTION send_punchlist_invite(p_invite_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite record;
  v_access_grant_id uuid;
  v_organization_id uuid;
  v_tt_days integer;
BEGIN
  -- Get the configured T&T duration (default 90 if not set)
  SELECT COALESCE(test_tune_period_days, 90) INTO v_tt_days
  FROM test_tune_settings
  LIMIT 1;

  IF v_tt_days IS NULL THEN
    v_tt_days := 90;
  END IF;

  -- Get the pending invite
  SELECT * INTO v_invite
  FROM pending_punchlist_invites
  WHERE id = p_invite_id
  AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found or already processed';
  END IF;

  -- Get organization_id from company_settings
  SELECT organization_id INTO v_organization_id
  FROM company_settings
  LIMIT 1;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization not configured';
  END IF;

  -- Check if contact already has active access
  IF EXISTS (
    SELECT 1 FROM punchlist_access_grants
    WHERE contact_id = v_invite.contact_id
    AND status = 'active'
    AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
  ) THEN
    RAISE EXCEPTION 'Contact already has active punchlist access';
  END IF;

  -- Create the access grant with organization_id and configured duration
  INSERT INTO punchlist_access_grants (
    contact_id,
    access_type,
    project_id,
    granted_date,
    expiration_date,
    status,
    notes,
    organization_id
  ) VALUES (
    v_invite.contact_id,
    'test_and_tune',
    v_invite.project_id,
    CURRENT_DATE,
    CURRENT_DATE + make_interval(days => v_tt_days),
    'active',
    'Granted via manual invite approval',
    v_organization_id
  )
  RETURNING id INTO v_access_grant_id;

  -- Create trial subscription if one doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM recurring_subscriptions
    WHERE contact_id = v_invite.contact_id
    AND status IN ('trial', 'active')
  ) THEN
    INSERT INTO recurring_subscriptions (
      company_id,
      organization_id,
      contact_id,
      plan_id,
      status,
      start_date,
      next_billing_date,
      trial_started_date,
      trial_end_date,
      notes,
      created_by
    ) VALUES (
      v_organization_id,
      v_organization_id,
      v_invite.contact_id,
      NULL,
      'trial',
      CURRENT_DATE,
      CURRENT_DATE + make_interval(days => v_tt_days),
      CURRENT_DATE,
      CURRENT_DATE + make_interval(days => v_tt_days),
      'Trial subscription created from punchlist invite',
      auth.uid()
    );
  END IF;

  -- Remove the pending invite (it's now an active grant)
  DELETE FROM pending_punchlist_invites
  WHERE id = p_invite_id;

  RETURN v_access_grant_id;
END;
$$;