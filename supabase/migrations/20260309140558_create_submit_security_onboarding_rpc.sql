/*
  # Create submit_security_onboarding RPC function

  ## Summary
  Creates a SECURITY DEFINER RPC function that handles the entire security onboarding
  form submission atomically, bypassing RLS to work regardless of whether the caller
  is anon or authenticated.

  ## Why this is needed
  The onboarding portal is accessed via a magic link by customers who may have no
  auth session (anon) OR may be logged in as a portal user. The RLS policies differ
  between anon and authenticated roles, causing intermittent failures. A SECURITY
  DEFINER function runs as the owner (postgres) and validates access via the magic
  link token directly, ensuring consistent behavior for all callers.

  ## What this function does
  1. Validates the magic link token is valid and not expired
  2. Updates the contact's personal and address information
  3. Updates the security contract to pending_approval with signature/payment details
  4. Inserts emergency contacts
  All in a single transaction.

  ## Security
  - Only proceeds if magic link token matches and is not expired
  - Raises exception if token is invalid or expired
*/

CREATE OR REPLACE FUNCTION submit_security_onboarding(
  p_token text,
  p_full_name text,
  p_email text,
  p_phone text,
  p_address_line1 text,
  p_city text,
  p_state text,
  p_zip_code text,
  p_signature text,
  p_customer_ip text,
  p_payment_method text,
  p_payment_token text,
  p_last_four text,
  p_emergency_contacts jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract RECORD;
  v_contact_id uuid;
  v_org_id uuid;
  v_ec jsonb;
BEGIN
  -- Validate token and get contract
  SELECT id, contact_id, organization_id, magic_link_expires_at, status
  INTO v_contract
  FROM security_contracts
  WHERE magic_link_token = p_token
    AND magic_link_token IS NOT NULL
    AND magic_link_expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired invitation link');
  END IF;

  IF v_contract.status NOT IN ('pending_customer', 'customer_completed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This agreement has already been processed');
  END IF;

  v_contact_id := v_contract.contact_id;
  v_org_id := v_contract.organization_id;

  -- Update contact information if contact exists
  IF v_contact_id IS NOT NULL THEN
    UPDATE contacts SET
      full_name = p_full_name,
      email = p_email,
      phone = p_phone,
      street_address = p_address_line1,
      city = p_city,
      state = p_state,
      zip_code = p_zip_code,
      updated_at = now()
    WHERE id = v_contact_id;
  END IF;

  -- Update security contract
  UPDATE security_contracts SET
    status = 'pending_approval',
    customer_completed_at = now(),
    customer_signature = p_signature,
    customer_signature_date = now(),
    customer_ip_address = p_customer_ip,
    payment_method = p_payment_method,
    payment_token = p_payment_token,
    last_four = p_last_four,
    updated_at = now()
  WHERE id = v_contract.id;

  -- Insert emergency contacts
  IF p_emergency_contacts IS NOT NULL AND jsonb_array_length(p_emergency_contacts) > 0 THEN
    FOR v_ec IN SELECT * FROM jsonb_array_elements(p_emergency_contacts)
    LOOP
      INSERT INTO security_contract_emergency_contacts (
        contract_id,
        organization_id,
        contact_name,
        phone_number,
        password_codeword,
        can_authorize_entry,
        priority_order
      ) VALUES (
        v_contract.id,
        v_org_id,
        v_ec->>'name',
        v_ec->>'phone',
        v_ec->>'password',
        COALESCE((v_ec->>'canAuthorize')::boolean, false),
        COALESCE((v_ec->>'priority_order')::integer, 1)
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Grant execute to both anon and authenticated roles
GRANT EXECUTE ON FUNCTION submit_security_onboarding(
  text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb
) TO anon, authenticated;
