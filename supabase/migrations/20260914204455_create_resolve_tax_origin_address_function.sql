/*
# Create resolve_tax_origin_address function

## Purpose
Resolves the seller/origin address for a transaction based on the dealer's
tax_origin_method setting in company_settings.

This function does NOT check taxability, nexus, destination, or calculation
readiness. It answers the origin question only.

## New Function
- `resolve_tax_origin_address(p_organization_id uuid, p_office_id uuid)`
  - SECURITY DEFINER, STABLE, search_path = 'public'
  - Returns jsonb with: origin_method, office_id, street, city, state, zip,
    review_required, review_reason

## Logic
1. Read company_settings.tax_origin_method for the organization.
2. If 'corporate': query company_offices where is_headquarters = true.
3. If 'assigned_office': query company_offices where id = p_office_id.
4. Validate the resolved address: street, city, state, and zip must all be
   non-null and non-empty. If any are missing, review_required = true with
   a specific reason.
5. No silent fallback to another office.

## Security
- SECURITY DEFINER so it can read company_settings and company_offices
  regardless of the caller's RLS context.
- search_path = 'public' to prevent path injection.

## Notes
- The headquarters office (is_headquarters = true) serves as the corporate
  address. This flag already exists on company_offices.
- If tax_origin_method = 'assigned_office' and p_office_id is NULL,
  review_required = true with reason "No office assigned to this transaction".
- If tax_origin_method = 'corporate' and no headquarters office exists,
  review_required = true with reason "No headquarters office found".
*/

CREATE OR REPLACE FUNCTION public.resolve_tax_origin_address(
  p_organization_id uuid,
  p_office_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_origin_method text;
  v_office_id uuid;
  v_street text;
  v_city text;
  v_state text;
  v_zip text;
  v_review_required boolean := false;
  v_review_reason text;
  v_office_name text;
BEGIN
  -- Read the dealer's tax origin method
  SELECT cs.tax_origin_method INTO v_origin_method
  FROM company_settings cs
  WHERE cs.organization_id = p_organization_id;

  -- Default to corporate if not set
  v_origin_method := COALESCE(v_origin_method, 'corporate');

  IF v_origin_method = 'corporate' THEN
    SELECT id, address_line1, city, state, zip, office_name
    INTO v_office_id, v_street, v_city, v_state, v_zip, v_office_name
    FROM company_offices
    WHERE organization_id = p_organization_id
      AND is_headquarters = true
    LIMIT 1;

    IF v_office_id IS NULL THEN
      RETURN jsonb_build_object(
        'origin_method', 'corporate',
        'office_id', NULL::uuid,
        'street', NULL, 'city', NULL, 'state', NULL, 'zip', NULL,
        'review_required', true,
        'review_reason', 'No headquarters office found. Set an office as headquarters or switch to Assigned Office Address mode.'
      );
    END IF;

  ELSIF v_origin_method = 'assigned_office' THEN
    IF p_office_id IS NULL THEN
      RETURN jsonb_build_object(
        'origin_method', 'assigned_office',
        'office_id', NULL::uuid,
        'street', NULL, 'city', NULL, 'state', NULL, 'zip', NULL,
        'review_required', true,
        'review_reason', 'No office assigned to this transaction. Assign an office or switch to Corporate Address mode.'
      );
    END IF;

    SELECT id, address_line1, city, state, zip, office_name
    INTO v_office_id, v_street, v_city, v_state, v_zip, v_office_name
    FROM company_offices
    WHERE id = p_office_id
      AND organization_id = p_organization_id;

    IF v_office_id IS NULL THEN
      RETURN jsonb_build_object(
        'origin_method', 'assigned_office',
        'office_id', p_office_id,
        'street', NULL, 'city', NULL, 'state', NULL, 'zip', NULL,
        'review_required', true,
        'review_reason', 'Assigned office not found. The office may have been deleted.'
      );
    END IF;
  END IF;

  -- Validate address completeness
  IF COALESCE(v_street, '') = '' OR COALESCE(v_city, '') = ''
     OR COALESCE(v_state, '') = '' OR COALESCE(v_zip, '') = '' THEN
    v_review_required := true;
    v_review_reason := 'Origin address incomplete for office "' || COALESCE(v_office_name, '(unknown)') || '". Missing: ';
    IF COALESCE(v_street, '') = '' THEN v_review_reason := v_review_reason || 'street, '; END IF;
    IF COALESCE(v_city, '') = '' THEN v_review_reason := v_review_reason || 'city, '; END IF;
    IF COALESCE(v_state, '') = '' THEN v_review_reason := v_review_reason || 'state, '; END IF;
    IF COALESCE(v_zip, '') = '' THEN v_review_reason := v_review_reason || 'zip, '; END IF;
    v_review_reason := rtrim(v_review_reason, ', ') || '.';
  END IF;

  RETURN jsonb_build_object(
    'origin_method', v_origin_method,
    'office_id', v_office_id,
    'street', v_street,
    'city', v_city,
    'state', v_state,
    'zip', v_zip,
    'review_required', v_review_required,
    'review_reason', v_review_reason
  );
END;
$function$;
