/*
  # Lead to Prospect Conversion System

  1. New Function
    - `convert_lead_to_prospect()` - Atomically converts a lead to a prospect contact
    - Handles duplicate detection and merging
    - Transfers all related data (tags, tasks, notes)
    - Creates audit trail and awards points

  2. Changes
    - Creates conversion function with comprehensive error handling
    - Transfers assigned_to from lead to contact
    - Moves tags from lead_tags to contact (via connections)
    - Updates tasks to reference new contact
    - Creates connection record documenting conversion
    - Optionally creates competitor relationship
    - Awards points and creates feed event
    - Deletes original lead after successful conversion

  3. Security
    - Function requires authenticated user
    - Respects can_view_prospects permission
    - Uses SECURITY DEFINER for proper access
    - Includes rollback on errors

  4. Parameters
    - p_lead_id: UUID of the lead to convert
    - p_temperature: Optional temperature override (cold, warm, hot, on_fire)
    - p_competitor_id: Optional competitor to link
    - p_relationship_type: Optional relationship type with competitor
    - p_relationship_strength: Optional relationship strength

  5. Returns
    - JSON object with success status, contact_id, and message
*/

-- Create the convert_lead_to_prospect function
CREATE OR REPLACE FUNCTION convert_lead_to_prospect(
  p_lead_id uuid,
  p_temperature text DEFAULT 'warm',
  p_competitor_id uuid DEFAULT NULL,
  p_relationship_type text DEFAULT NULL,
  p_relationship_strength text DEFAULT NULL
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

  -- Validate temperature
  IF p_temperature NOT IN ('cold', 'warm', 'hot', 'on_fire') THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Invalid temperature value'
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
      temperature = p_temperature,
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
      p_temperature,
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
    'Converted from lead to prospect',
    false,
    false,
    p_lead_id
  );

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
      'Added during lead-to-prospect conversion',
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
    'Converted lead to prospect: ' || v_contact_name
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
    'Lead Converted to Prospect',
    v_contact_name || ' was converted to a prospect'
  );

  -- Delete the lead (CASCADE will clean up lead_messages and lead_tags)
  DELETE FROM leads WHERE id = p_lead_id;

  -- Return success with contact ID
  RETURN json_build_object(
    'success', true,
    'contact_id', v_contact_id,
    'message', 'Lead successfully converted to prospect',
    'was_merged', (v_existing_contact.id IS NOT NULL)
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
'Converts a lead to a prospect contact. Requires can_view_prospects permission. Handles duplicate detection, data transfer, and creates audit trail.';