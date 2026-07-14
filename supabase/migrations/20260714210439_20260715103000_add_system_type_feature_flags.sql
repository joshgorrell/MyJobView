/*
# System Type Feature Flag Configuration

## Summary
Adds enabled_system_types column to company_settings to control which system types
are available for creating new service agreements. Only 'security' is enabled for
the initial release; all other system types remain disabled until a future rollout.

## New Columns on company_settings
- enabled_system_types: jsonb (default '["security"]') — array of enabled system type strings

## Functions

### is_system_type_enabled(p_system_type text)
SECURITY DEFINER function that reads enabled_system_types from company_settings
and returns boolean. EXECUTE granted to authenticated role only.

## Security
- The function is SECURITY DEFINER so it can read company_settings regardless of RLS.
- EXECUTE revoked from PUBLIC and anon; granted to authenticated only.
*/

ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS enabled_system_types jsonb DEFAULT '["security"]'::jsonb;

-- Drop existing function if exists (for idempotency)
DROP FUNCTION IF EXISTS is_system_type_enabled(text);

CREATE OR REPLACE FUNCTION is_system_type_enabled(p_system_type text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled_types jsonb;
BEGIN
  SELECT enabled_system_types
  INTO v_enabled_types
  FROM company_settings
  LIMIT 1;

  IF v_enabled_types IS NULL THEN
    RETURN p_system_type = 'security';
  END IF;

  RETURN v_enabled_types ? p_system_type;
END;
$$;

REVOKE ALL ON FUNCTION is_system_type_enabled(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_system_type_enabled(text) TO authenticated;
