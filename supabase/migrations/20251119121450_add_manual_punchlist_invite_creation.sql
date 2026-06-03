/*
  # Add Manual Punchlist Invite Creation

  ## Summary
  Allows staff to manually create punchlist invites for any contact at any time,
  not just automatically when projects complete.

  ## Changes

  ### New Function: create_manual_punchlist_invite
  Staff can create an invite for any contact, even without a project.
  - Checks for existing pending invites (prevents duplicates)
  - Checks for existing active access (prevents duplicates)
  - Creates pending invite for staff to review and send

  ### Use Cases
  1. Onboard existing customers to punchlist
  2. Grant access without project completion
  3. Give access to customers for marketing/trial purposes
  4. Re-invite customers after access expired
*/

-- Create function to manually create punchlist invites
CREATE OR REPLACE FUNCTION create_manual_punchlist_invite(
  p_contact_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite_id uuid;
  v_contact_name text;
BEGIN
  -- Get contact name for notes
  SELECT full_name INTO v_contact_name
  FROM contacts
  WHERE id = p_contact_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  -- Check if contact already has pending invite
  IF EXISTS (
    SELECT 1 FROM pending_punchlist_invites 
    WHERE contact_id = p_contact_id 
    AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Contact already has a pending punchlist invite';
  END IF;

  -- Check if contact already has active access
  IF EXISTS (
    SELECT 1 FROM punchlist_access_grants
    WHERE contact_id = p_contact_id
    AND status = 'active'
    AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
  ) THEN
    RAISE EXCEPTION 'Contact already has active punchlist access';
  END IF;

  -- Create the pending invite
  INSERT INTO pending_punchlist_invites (
    contact_id,
    project_id,
    status,
    notes
  ) VALUES (
    p_contact_id,
    NULL,  -- No project association for manual invites
    'pending',
    COALESCE(
      p_notes, 
      'Manual invite created for ' || v_contact_name || ' by staff on ' || CURRENT_DATE::text
    )
  )
  RETURNING id INTO v_invite_id;

  RETURN v_invite_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_manual_punchlist_invite(uuid, text) TO authenticated;
