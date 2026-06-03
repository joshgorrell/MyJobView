/*
  # Add Direct Punchlist Access Grant Function

  ## Summary
  Allows admins to directly grant 90-day Test & Tune punchlist access to contacts
  from the contact detail page without going through the pending invite flow.

  ## Changes

  ### New Function: grant_punchlist_access_directly
  - Checks for existing active access (can renew if expired)
  - Creates or renews access grant immediately
  - Sets 90-day expiration from current date
  - Returns access grant ID and whether it was a renewal

  ## Use Cases
  1. Quick access grant from contact page
  2. Marketing/trial access
  3. Immediate access for special cases
*/

-- Create function to directly grant punchlist access
CREATE OR REPLACE FUNCTION grant_punchlist_access_directly(
  p_contact_id uuid,
  p_days integer DEFAULT 90,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  access_grant_id uuid,
  is_renewal boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_grant_id uuid;
  v_is_renewal boolean := false;
  v_contact_name text;
BEGIN
  -- Verify contact exists
  SELECT full_name INTO v_contact_name
  FROM contacts
  WHERE id = p_contact_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  -- Check if contact already has an access grant (active or expired)
  SELECT id INTO v_existing_grant_id
  FROM punchlist_access_grants
  WHERE contact_id = p_contact_id
  LIMIT 1;

  IF v_existing_grant_id IS NOT NULL THEN
    -- Renew existing grant
    v_is_renewal := true;

    UPDATE punchlist_access_grants
    SET
      status = 'active',
      granted_date = CURRENT_DATE,
      expiration_date = CURRENT_DATE + (p_days || ' days')::interval,
      notes = COALESCE(
        p_notes,
        'Access renewed directly by admin on ' || CURRENT_DATE::text
      ),
      updated_at = now()
    WHERE id = v_existing_grant_id;

  ELSE
    -- Create new grant
    v_is_renewal := false;

    INSERT INTO punchlist_access_grants (
      contact_id,
      access_type,
      project_id,
      granted_date,
      expiration_date,
      status,
      notes
    ) VALUES (
      p_contact_id,
      'test_and_tune',
      NULL,
      CURRENT_DATE,
      CURRENT_DATE + (p_days || ' days')::interval,
      'active',
      COALESCE(
        p_notes,
        'Access granted directly to ' || v_contact_name || ' by admin on ' || CURRENT_DATE::text
      )
    )
    RETURNING id INTO v_existing_grant_id;
  END IF;

  RETURN QUERY SELECT v_existing_grant_id, v_is_renewal;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION grant_punchlist_access_directly(uuid, integer, text) TO authenticated;

-- Add comment
COMMENT ON FUNCTION grant_punchlist_access_directly IS 'Directly grant or renew punchlist access for a contact without pending invite flow';
