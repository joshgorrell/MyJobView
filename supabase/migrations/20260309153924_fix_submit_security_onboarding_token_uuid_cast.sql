/*
  # Fix submit_security_onboarding: cast text token to uuid

  ## Problem
  magic_link_token is a uuid column but p_token is passed as text,
  causing "operator does not exist: uuid = text".

  ## Fix
  Cast p_token to uuid in the WHERE clause.
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
  v_first_name text;
  v_last_name text;
  v_space_pos int;
  v_token_uuid uuid;
BEGIN
  -- Safely cast token text to uuid
  BEGIN
    v_token_uuid := p_token::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired invitation link');
  END;

  -- Validate token and get contract
  SELECT id, contact_id, organization_id, magic_link_expires_at, status
  INTO v_contract
  FROM security_contracts
  WHERE magic_link_token = v_token_uuid
    AND magic_link_expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired invitation link');
  END IF;

  IF v_contract.status NOT IN ('pending_customer', 'customer_completed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This agreement has already been processed');
  END IF;

  v_contact_id := v_contract.contact_id;
  v_org_id := v_contract.organization_id;

  -- Split full_name into first/last (split on first space)
  IF p_full_name IS NOT NULL AND p_full_name <> '' THEN
    v_space_pos := position(' ' IN trim(p_full_name));
    IF v_space_pos > 0 THEN
      v_first_name := trim(substring(p_full_name FROM 1 FOR v_space_pos - 1));
      v_last_name  := trim(substring(p_full_name FROM v_space_pos + 1));
    ELSE
      v_first_name := trim(p_full_name);
      v_last_name  := NULL;
    END IF;
  END IF;

  -- Update contact information if contact exists
  IF v_contact_id IS NOT NULL THEN
    UPDATE contacts SET
      first_name   = COALESCE(v_first_name, first_name),
      last_name    = COALESCE(v_last_name, last_name),
      contact_name = COALESCE(p_full_name, contact_name),
      email        = COALESCE(p_email, email),
      phone        = COALESCE(p_phone, phone),
      street_address = COALESCE(p_address_line1, street_address),
      city     = COALESCE(p_city, city),
      state    = COALESCE(p_state, state),
      zip_code = COALESCE(p_zip_code, zip_code),
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

GRANT EXECUTE ON FUNCTION submit_security_onboarding(
  text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb
) TO anon, authenticated;
