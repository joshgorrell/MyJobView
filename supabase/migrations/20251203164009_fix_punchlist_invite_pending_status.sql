/*
  # Fix Punchlist Invite to Create Pending Access

  ## Summary
  Updates the send_punchlist_invite function to create access grants with 'pending' status
  instead of 'active'. The status should only change to 'active' after the customer accepts
  the invitation via the portal.

  ## Changes
  1. Modify send_punchlist_invite to create grants with status='pending'
  2. Update notes to reflect pending status
  
  ## Workflow
  - Staff sends invite → Creates 'pending' access grant
  - Customer clicks link and accepts → Changes to 'active'
  - After 90 days → Changes to 'expired'
*/

-- Update the send_punchlist_invite function to create pending access
CREATE OR REPLACE FUNCTION send_punchlist_invite(p_invite_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite record;
  v_access_grant_id uuid;
BEGIN
  -- Get the pending invite
  SELECT * INTO v_invite
  FROM pending_punchlist_invites
  WHERE id = p_invite_id
  AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found or already processed';
  END IF;

  -- Check if contact already has active or pending access
  IF EXISTS (
    SELECT 1 FROM punchlist_access_grants
    WHERE contact_id = v_invite.contact_id
    AND status IN ('active', 'pending')
    AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
  ) THEN
    RAISE EXCEPTION 'Contact already has active or pending punchlist access';
  END IF;

  -- Create the access grant with 'pending' status
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
    'pending',
    'Invitation sent - awaiting customer acceptance'
  )
  RETURNING id INTO v_access_grant_id;

  -- Remove the pending invite (it's now a pending grant)
  DELETE FROM pending_punchlist_invites
  WHERE id = p_invite_id;

  RETURN v_access_grant_id;
END;
$$;

-- Create function for customer to accept the punchlist invitation
CREATE OR REPLACE FUNCTION accept_punchlist_invitation(p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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
$$;