-- Fix resolve_tax_exemption to return a composite type matching how
-- calculate_tax_context uses it: SELECT exemption_reference FROM resolve_tax_exemption(...)
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
  v_ref text;
BEGIN
  IF p_contact_id IS NOT NULL THEN
    SELECT is_tax_exempt INTO v_contact_exempt
    FROM contacts
    WHERE id = p_contact_id;

    IF v_contact_exempt THEN
      v_ref := 'EXEM-' || substr(p_contact_id::text, 1, 8);
    END IF;
  END IF;

  RETURN QUERY SELECT v_ref, v_contact_exempt;
END;
$$;
