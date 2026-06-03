/*
  # Create Trial Subscription When Punchlist Invite is Sent

  ## Summary
  Automatically creates a 90-day trial subscription when a punchlist invite is sent.
  This allows customers invited through the punchlist system to appear in the VIP Trial Customers list.

  ## Changes
  1. Update send_punchlist_invite() function to create trial subscription record
  2. Trial subscriptions have:
     - status = 'trial'
     - trial_started_date = today
     - trial_end_date = today + 90 days
     - no plan_id (null) since it's a trial

  ## Benefits
  - Customers invited via punchlist now appear in VIP Trial Customers tab
  - Admin can extend trials from the VIP Management page
  - Unified trial management across the platform
  - Trials can be converted to paid subscriptions later

  ## Security
  - Function remains SECURITY DEFINER with proper checks
  - Inherits existing RLS policies
*/

-- Update the send_punchlist_invite function to also create a trial subscription
CREATE OR REPLACE FUNCTION send_punchlist_invite(p_invite_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite record;
  v_access_grant_id uuid;
  v_contact_company_id uuid;
BEGIN
  -- Get the pending invite
  SELECT * INTO v_invite
  FROM pending_punchlist_invites
  WHERE id = p_invite_id
  AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found or already processed';
  END IF;

  -- Get company_id from the contact for trial subscription
  SELECT company_id INTO v_contact_company_id
  FROM contacts
  WHERE id = v_invite.contact_id;

  -- Check if contact already has active access
  IF EXISTS (
    SELECT 1 FROM punchlist_access_grants
    WHERE contact_id = v_invite.contact_id
    AND status = 'active'
    AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
  ) THEN
    RAISE EXCEPTION 'Contact already has active punchlist access';
  END IF;

  -- Create the access grant with 'active' status
  INSERT INTO punchlist_access_grants (
    contact_id,
    access_type,
    project_id,
    granted_date,
    expiration_date,
    status,
    notes
  ) VALUES (
    v_invite.contact_id,
    'test_and_tune',
    v_invite.project_id,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '90 days',
    'active',
    'Granted via manual invite approval'
  )
  RETURNING id INTO v_access_grant_id;

  -- Create trial subscription if one doesn't exist
  -- Check if contact already has an active or trial subscription
  IF NOT EXISTS (
    SELECT 1 FROM recurring_subscriptions
    WHERE contact_id = v_invite.contact_id
    AND status IN ('trial', 'active')
  ) THEN
    INSERT INTO recurring_subscriptions (
      company_id,
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
      v_contact_company_id,
      v_invite.contact_id,
      NULL,  -- No plan yet, just trial
      'trial',
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '90 days',  -- Set next billing after trial
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION send_punchlist_invite(uuid) TO authenticated;
