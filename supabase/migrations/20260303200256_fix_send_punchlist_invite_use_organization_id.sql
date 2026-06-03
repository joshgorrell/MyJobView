/*
  # Fix send_punchlist_invite to use organization_id

  ## Problem
  The send_punchlist_invite() function was:
  1. Looking up company_id from company_settings.id (the row PK, not organization_id)
  2. Inserting into recurring_subscriptions with company_id but NOT setting organization_id
  3. NOT setting organization_id on punchlist_access_grants

  Both tables require organization_id for RLS to work. This caused silent failures
  or RLS violations when the button was clicked.

  ## Fix
  - Get organization_id from company_settings.organization_id
  - Set organization_id on punchlist_access_grants insert
  - Set organization_id (and keep company_id for backwards compat) on recurring_subscriptions insert
*/

CREATE OR REPLACE FUNCTION public.send_punchlist_invite(p_invite_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invite record;
  v_access_grant_id uuid;
  v_organization_id uuid;
BEGIN
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

  -- Create the access grant with organization_id
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
    CURRENT_DATE + INTERVAL '90 days',
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
      CURRENT_DATE + INTERVAL '90 days',
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '90 days',
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
