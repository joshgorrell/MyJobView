/*
# Preserve Contacts page pagination

## Summary

This migration updates `get_contacts_with_balance` so the requested contact
limit is applied before the response is aggregated into JSON. The previous
repair corrected loading but still allowed the aggregate to process every
matching contact before the limit clause.

## Modified Function

1. `get_contacts_with_balance`
   - Filters contacts by organization, view, type, temperature, and search.
   - Orders and limits the matching contacts in a dedicated result set.
   - Builds the existing contact response shape from that limited result set.
   - Returns the total number of matching contacts separately.

## Security

1. Organization access remains scoped to the signed-in user's profile.
2. The My Contacts filter continues to use `auth.uid()`.
3. Search input remains a SQL value, not executable SQL.
4. No rows, columns, or tables are deleted or changed.
*/

CREATE OR REPLACE FUNCTION get_contacts_with_balance(
  p_limit int DEFAULT 50,
  p_search text DEFAULT '',
  p_type_filter text DEFAULT 'all',
  p_temperature_filter text DEFAULT 'all',
  p_view_filter text DEFAULT 'all',
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_result jsonb;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM profiles
  WHERE id = auth.uid();

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('contacts', '[]'::jsonb, 'total', 0);
  END IF;

  WITH filtered_contacts AS (
    SELECT c.*,
      count(*) OVER () AS matching_total
    FROM contacts c
    WHERE c.organization_id = v_org_id
      AND (p_view_filter <> 'my' OR c.created_by = auth.uid() OR c.assigned_to = auth.uid())
      AND (
        p_type_filter = 'all'
        OR (p_type_filter = 'lead' AND c.contact_type = 'lead')
        OR (p_type_filter = 'prospect' AND c.contact_type = 'prospect')
        OR (p_type_filter = 'customer' AND c.contact_type NOT IN ('lead', 'prospect'))
      )
      AND (
        p_temperature_filter = 'all'
        OR (
          c.temperature = p_temperature_filter
          AND (p_type_filter <> 'all' OR c.contact_type IN ('lead', 'prospect'))
        )
      )
      AND (
        COALESCE(trim(p_search), '') = ''
        OR c.first_name ILIKE '%' || p_search || '%'
        OR c.last_name ILIKE '%' || p_search || '%'
        OR c.contact_name ILIKE '%' || p_search || '%'
        OR c.company_name ILIKE '%' || p_search || '%'
        OR c.email ILIKE '%' || p_search || '%'
        OR c.phone ILIKE '%' || p_search || '%'
      )
    ORDER BY c.last_name ASC NULLS LAST, c.first_name ASC NULLS LAST, c.company_name ASC NULLS LAST
    LIMIT GREATEST(0, LEAST(COALESCE(p_limit, 50), 200))
  ),
  contact_rows AS (
    SELECT fc.*,
      COALESCE(b.balance_due, 0) AS balance_due,
      COALESCE(p.first_name || ' ' || p.last_name, p.first_name, p.last_name, '') AS assigned_rep_name,
      COALESCE(co.office_name, '') AS office_name,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', ct.id, 'tag', ct.tag, 'color', ct.color))
        FROM contact_tags ct
        WHERE ct.contact_id = fc.id
      ), '[]'::jsonb) AS tags
    FROM filtered_contacts fc
    LEFT JOIN profiles p ON p.id = fc.assigned_to
    LEFT JOIN company_offices co ON co.id = fc.office_id
    LEFT JOIN (
      SELECT i.contact_id, COALESCE(SUM(i.amount_due), 0) AS balance_due
      FROM invoices i
      WHERE i.status NOT IN ('voided', 'paid')
        AND i.organization_id = v_org_id
      GROUP BY i.contact_id
    ) b ON b.contact_id = fc.id
  )
  SELECT jsonb_build_object(
    'contacts', COALESCE(jsonb_agg(jsonb_build_object(
      'id', id,
      'contact_name', contact_name,
      'first_name', first_name,
      'last_name', last_name,
      'company_name', company_name,
      'email', email,
      'phone', phone,
      'contact_type', contact_type,
      'temperature', temperature,
      'portal_access_enabled', portal_access_enabled,
      'business_card_photo', business_card_photo,
      'last_contact_date', last_contact_date,
      'next_follow_up', next_follow_up,
      'assigned_to', assigned_to,
      'office_id', office_id,
      'assigned_rep_name', assigned_rep_name,
      'office_name', office_name,
      'balance_due', balance_due,
      'tags', tags
    )), '[]'::jsonb),
    'total', COALESCE(max(matching_total), 0)
  )
  INTO v_result
  FROM contact_rows;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_contacts_with_balance(int, text, text, text, text, uuid) TO authenticated;
