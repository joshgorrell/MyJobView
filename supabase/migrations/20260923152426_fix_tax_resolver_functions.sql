-- Fix resolve_tax_destination: use actual dealer_nexus_states values (yes/no/unknown)
-- Fix resolve_tax_exemption: validate against tax_exemption_certificates table

-- ============================================================
-- 1. resolve_tax_destination — corrected nexus value mapping
-- ============================================================
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
  v_nexus_status text;
BEGIN
  IF p_state IS NULL OR p_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'review_required', true,
      'review_reason', 'Missing state or organization for tax destination',
      'collection_status', 'review_required',
      'nexus_status', 'unknown'
    );
  END IF;

  -- Check dealer_nexus_states for this org + state (current rows only)
  SELECT nexus_status INTO v_nexus_status
  FROM dealer_nexus_states
  WHERE organization_id = p_org_id
    AND state = p_state
    AND COALESCE(is_current, true) = true
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  -- No row found: missing configuration is UNKNOWN, not "no nexus"
  IF v_nexus_status IS NULL THEN
    RETURN jsonb_build_object(
      'review_required', true,
      'review_reason', 'No nexus configuration found for destination state ' || p_state || '. Configure nexus status for this state before collecting tax.',
      'collection_status', 'review_required',
      'nexus_status', 'unknown'
    );
  END IF;

  -- Map actual CHECK constraint values: yes / no / unknown
  IF v_nexus_status = 'yes' THEN
    RETURN jsonb_build_object(
      'review_required', false,
      'review_reason', null,
      'collection_status', 'collecting',
      'nexus_status', 'yes'
    );
  ELSIF v_nexus_status = 'no' THEN
    RETURN jsonb_build_object(
      'review_required', false,
      'review_reason', null,
      'collection_status', 'not_collecting',
      'nexus_status', 'no'
    );
  ELSIF v_nexus_status = 'unknown' THEN
    RETURN jsonb_build_object(
      'review_required', true,
      'review_reason', 'Nexus status is unknown for destination state ' || p_state || '. Determine nexus before collecting or waiving tax.',
      'collection_status', 'review_required',
      'nexus_status', 'unknown'
    );
  ELSE
    -- Unexpected value — treat as unknown for safety
    RETURN jsonb_build_object(
      'review_required', true,
      'review_reason', 'Unrecognized nexus status "' || COALESCE(v_nexus_status, '(null)') || '" for destination state ' || p_state || '.',
      'collection_status', 'review_required',
      'nexus_status', 'unknown'
    );
  END IF;
END;
$$;

-- ============================================================
-- 2. resolve_tax_exemption — validate against real certificates
-- ============================================================
DROP FUNCTION IF EXISTS resolve_tax_exemption(uuid, text, text, text);

CREATE OR REPLACE FUNCTION resolve_tax_exemption(
  p_contact_id uuid,
  p_state text,
  p_environment text,
  p_project_type text
) RETURNS TABLE(exemption_reference text, is_exempt boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_exempt boolean := false;
  v_cert_number text;
BEGIN
  IF p_contact_id IS NULL THEN
    RETURN QUERY SELECT NULL::text, false;
    RETURN;
  END IF;

  -- Step 1: contact must be flagged as tax exempt
  SELECT is_tax_exempt INTO v_contact_exempt
  FROM contacts
  WHERE id = p_contact_id;

  IF NOT COALESCE(v_contact_exempt, false) THEN
    RETURN QUERY SELECT NULL::text, false;
    RETURN;
  END IF;

  -- Step 2: a valid, active, unexpired certificate must exist
  -- Matches the existing getApplicableTaxRate() pattern in taxCalculations.ts:
  --   contact_id match, is_active = true, expiration check
  -- No issuing_state filter: the existing MJV architecture has no
  -- applicability-by-transaction-state model for certificates.
  SELECT certificate_number INTO v_cert_number
  FROM tax_exemption_certificates
  WHERE contact_id = p_contact_id
    AND COALESCE(is_active, true) = true
    AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
  ORDER BY
    CASE WHEN expiration_date IS NULL THEN 1 ELSE 0 END DESC,
    expiration_date ASC
  LIMIT 1;

  IF v_cert_number IS NOT NULL THEN
    RETURN QUERY SELECT v_cert_number, true;
  ELSE
    -- Flagged exempt but no valid certificate — do NOT grant exemption
    RETURN QUERY SELECT NULL::text, false;
  END IF;
END;
$$;
