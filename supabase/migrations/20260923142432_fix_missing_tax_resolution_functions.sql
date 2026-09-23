-- Create missing resolve_tax_destination and resolve_tax_exemption functions
-- These were referenced by calculate_tax_context but never created, causing
-- the tax snapshot trigger to fail on INSERT of submitted invoices.

-- resolve_tax_destination: determines nexus/collection status for a state + org
CREATE OR REPLACE FUNCTION resolve_tax_destination(
  p_state text,
  p_org_id uuid,
  p_contact_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nexus_status text := 'not_registered';
  v_collection_status text := 'not_collecting';
  v_review_required boolean := false;
  v_review_reason text;
BEGIN
  IF p_state IS NULL OR p_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'review_required', true,
      'review_reason', 'Missing state or organization for tax destination',
      'collection_status', 'not_collecting',
      'nexus_status', 'not_registered'
    );
  END IF;

  -- Check dealer nexus states for this org + state
  SELECT nexus_status INTO v_nexus_status
  FROM dealer_nexus_states
  WHERE organization_id = p_org_id
    AND state = p_state
    AND COALESCE(is_current, true) = true
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_nexus_status = 'collecting' THEN
    v_collection_status := 'collecting';
  ELSIF v_nexus_status = 'registered' THEN
    v_collection_status := 'not_collecting';
    v_review_required := true;
    v_review_reason := 'Registered for nexus but not collecting in ' || p_state;
  ELSE
    v_collection_status := 'not_collecting';
    v_nexus_status := COALESCE(v_nexus_status, 'not_registered');
  END IF;

  RETURN jsonb_build_object(
    'review_required', v_review_required,
    'review_reason', v_review_reason,
    'collection_status', v_collection_status,
    'nexus_status', v_nexus_status
  );
END;
$$;

-- resolve_tax_exemption: checks if a contact has a tax exemption for the state
CREATE OR REPLACE FUNCTION resolve_tax_exemption(
  p_contact_id uuid,
  p_state text,
  p_environment text,
  p_project_type text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exemption_reference text;
  v_contact_exempt boolean := false;
BEGIN
  IF p_contact_id IS NULL THEN
    RETURN jsonb_build_object('exemption_reference', null, 'is_exempt', false);
  END IF;

  -- Check if contact is marked as tax exempt
  SELECT is_tax_exempt INTO v_contact_exempt
  FROM contacts
  WHERE id = p_contact_id;

  IF v_contact_exempt THEN
    -- Generate an exemption reference from contact id
    v_exemption_reference := 'EXEM-' || substr(p_contact_id::text, 1, 8);
  END IF;

  RETURN jsonb_build_object(
    'exemption_reference', v_exemption_reference,
    'is_exempt', v_contact_exempt
  );
END;
$$;
