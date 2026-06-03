/*
  # Update Lead to Prospect Conversion - Remove Temperature, Add Follow-Up Scheduling

  1. Changes
    - Remove temperature requirement from prospects (set to NULL)
    - Temperature tracking is only for active leads, not prospects
    - Add optional follow-up scheduling parameters
    - Create scheduled connection when follow-up is provided
    - Update messaging from "convert" to "downgrade"

  2. New Parameters
    - p_follow_up_date: Optional scheduled follow-up date
    - p_follow_up_type: Optional connection type (call, email, meeting, etc)
    - p_follow_up_notes: Optional notes for the follow-up

  3. Behavior
    - Prospects now have NULL temperature (no temperature tracking)
    - When follow-up is scheduled, creates a scheduled_connections record
    - Maintains all other conversion functionality
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS convert_lead_to_prospect(uuid, text, uuid, text, text);

-- Recreate the function with updated signature
CREATE OR REPLACE FUNCTION convert_lead_to_prospect(
  p_lead_id uuid,
  p_competitor_id uuid DEFAULT NULL,
  p_relationship_type text DEFAULT NULL,
  p_relationship_strength text DEFAULT NULL,
  p_follow_up_date timestamptz DEFAULT NULL,
  p_follow_up_type text DEFAULT 'call',
  p_follow_up_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
  v_contact_id uuid;
  v_existing_contact record;
  v_user_id uuid;
  v_can_view_prospects boolean;
  v_company_id uuid;
  v_office_id uuid;
  v_lead_converted_points integer := 25;
  v_contact_name text;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'message', 'User not authenticated'
    );
  END IF;

  -- Check if user has prospect permission
  SELECT can_view_prospects, company_id, office_id
  INTO v_can_view_prospects, v_company_id, v_office_id
  FROM profiles
  WHERE id = v_user_id;

  IF NOT v_can_view_prospects THEN
    RETURN json_build_object(
      'success', false,
      'message', 'You do not have permission to manage prospects'
    );
  END IF;

  -- Get the lead data
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Lead not found'
    );
  END IF;

  -- Check for existing contact by email or phone (case-insensitive)
  SELECT * INTO v_existing_contact
  FROM contacts
  WHERE (
    (v_lead.email IS NOT NULL AND LOWER(email) = LOWER(v_lead.email))
    OR
    (v_lead.phone IS NOT NULL AND phone = v_lead.phone)
  )
  LIMIT 1;

  -- Determine contact name
  v_contact_name := COALESCE(v_lead.contact_name, v_lead.company_name, 'Unnamed Prospect');

  IF FOUND THEN
    -- Update existing contact to be a prospect
    v_contact_id := v_existing_contact.id;

    UPDATE contacts
    SET
      is_prospect = true,
      contact_type = 'prospect',
      temperature = NULL,  -- Prospects don't have temperature tracking
      -- Merge data, preferring non-null lead values
      full_name = COALESCE(v_lead.contact_name, full_name, v_contact_name),
      company = COALESCE(v_lead.company_name, company),
      email = COALESCE(v_lead.email, email),
      phone = COALESCE(v_lead.phone, phone),
      notes = CASE
        WHEN notes IS NOT NULL AND v_lead.opportunity_description IS NOT NULL
        THEN notes || E'\n\n--- Merged from Lead ---\n' || v_lead.opportunity_description
        WHEN v_lead.opportunity_description IS NOT NULL
        THEN v_lead.opportunity_description
        ELSE notes
      END,
      assigned_to = COALESCE(v_lead.assigned_to, assigned_to),
      updated_at = now()
    WHERE id = v_contact_id;
  ELSE
    -- Create new contact as prospect
    INSERT INTO contacts (
      full_name,
      company,
      email,
      phone,
      notes,
      contact_type,
      is_prospect,
      temperature,
      assigned_to,
      office_id,
      created_by
    ) VALUES (
      v_contact_name,
      v_lead.company_name,
      v_lead.email,
      v_lead.phone,
      v_lead.opportunity_description,
      'prospect',
      true,
      NULL,  -- Prospects don't have temperature tracking
      v_lead.assigned_to,
      COALESCE(v_lead.office_id, v_office_id),
      v_user_id
    )
    RETURNING id INTO v_contact_id;
  END IF;

  -- Create connection record documenting the conversion
  INSERT INTO connections (
    user_id,
    contact_id,
    connection_type,
    connection_date,
    notes,
    follow_up_needed,
    lead_created,
    lead_id
  ) VALUES (
    v_user_id,
    v_contact_id,
    'other',
    now(),
    'Downgraded from lead to prospect for future follow-up',
    false,
    false,
    p_lead_id
  );

  -- Create scheduled follow-up if date is provided
  IF p_follow_up_date IS NOT NULL THEN
    INSERT INTO scheduled_connections (
      user_id,
      contact_id,
      scheduled_date,
      connection_type,
      notes,
      status
    ) VALUES (
      v_user_id,
      v_contact_id,
      p_follow_up_date,
      COALESCE(p_follow_up_type, 'call'),
      COALESCE(p_follow_up_notes, 'Follow-up from lead-to-prospect downgrade'),
      'pending'
    );
  END IF;

  -- Update any tasks linked to the lead to also reference the contact
  UPDATE tasks
  SET contact_id = v_contact_id
  WHERE lead_id = p_lead_id AND contact_id IS NULL;

  -- Create competitor relationship if specified
  IF p_competitor_id IS NOT NULL THEN
    INSERT INTO prospect_competitor_relationships (
      prospect_id,
      competitor_id,
      relationship_type,
      relationship_strength,
      notes,
      created_by
    ) VALUES (
      v_contact_id,
      p_competitor_id,
      COALESCE(p_relationship_type, 'evaluating'),
      COALESCE(p_relationship_strength, 'moderate'),
      'Added during lead-to-prospect downgrade',
      v_user_id
    )
    ON CONFLICT (prospect_id, competitor_id)
    DO UPDATE SET
      relationship_type = COALESCE(p_relationship_type, prospect_competitor_relationships.relationship_type),
      relationship_strength = COALESCE(p_relationship_strength, prospect_competitor_relationships.relationship_strength),
      updated_at = now();
  END IF;

  -- Award points to the user for converting the lead
  PERFORM award_points(
    v_user_id,
    v_lead_converted_points,
    'Downgraded lead to prospect: ' || v_contact_name
  );

  -- Create feed event for the conversion
  INSERT INTO feed_events (
    event_type,
    user_id,
    lead_id,
    title,
    description
  ) VALUES (
    'lead_converted',
    v_user_id,
    p_lead_id,
    'Lead Downgraded to Prospect',
    v_contact_name || ' was downgraded to a prospect for future follow-up'
  );

  -- Delete the lead (CASCADE will clean up lead_messages and lead_tags)
  DELETE FROM leads WHERE id = p_lead_id;

  -- Return success with contact ID and follow-up info
  RETURN json_build_object(
    'success', true,
    'contact_id', v_contact_id,
    'message', 'Lead successfully downgraded to prospect',
    'was_merged', (v_existing_contact.id IS NOT NULL),
    'follow_up_scheduled', (p_follow_up_date IS NOT NULL)
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Log error and return failure
    RAISE LOG 'Error converting lead to prospect: %', SQLERRM;
    RETURN json_build_object(
      'success', false,
      'message', 'Error converting lead: ' || SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION convert_lead_to_prospect TO authenticated;

-- Add comment
COMMENT ON FUNCTION convert_lead_to_prospect IS
'Downgrades a lead to a prospect contact for future follow-up. Requires can_view_prospects permission. Prospects do not have temperature tracking. Handles duplicate detection, data transfer, optional follow-up scheduling, and creates audit trail.';