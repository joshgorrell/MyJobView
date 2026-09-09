/*
# Fix Contacts page RPC query construction

## Summary

This migration repairs the server-side function that loads the Contacts page.
The previous function passed its organization ID into the wrong dynamic SQL
placeholder, which could make the contact list fail to load for signed-in users.

## Modified Functions

1. `get_contacts_with_balance`
   - Keeps the existing return shape used by the Contacts page.
   - Uses direct SQL conditions instead of fragile dynamic SQL assembly.
   - Enforces the signed-in user's organization and the authenticated user's
     own-record filter for the My Contacts view.
   - Keeps search, type, temperature, balance, office, representative, and tag
     data unchanged.

## Security

1. Organization filtering continues to come from the signed-in user's profile.
2. The My Contacts filter uses `auth.uid()` rather than trusting a caller-provided
   user ID.
3. Search text is treated as a value, not executable SQL.
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
  SELECT organization_id
  INTO v_org_id
  FROM profiles
  WHERE id = auth.uid();

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('contacts', '[]'::jsonb, 'total', 0);
  END IF;

  SELECT jsonb_build_object(
    'contacts', COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'contact_name', c.contact_name,
      'first_name', c.first_name,
      'last_name', c.last_name,
      'company_name', c.company_name,
      'email', c.email,
      'phone', c.phone,
      'contact_type', c.contact_type,
      'temperature', c.temperature,
      'portal_access_enabled', c.portal_access_enabled,
      'business_card_photo', c.business_card_photo,
      'last_contact_date', c.last_contact_date,
      'next_follow_up', c.next_follow_up,
      'assigned_to', c.assigned_to,
      'office_id', c.office_id,
      'assigned_rep_name', COALESCE(p.first_name || ' ' || p.last_name, p.first_name, p.last_name, ''),
      'office_name', COALESCE(co.office_name, ''),
      'balance_due', COALESCE(b.balance_due, 0),
      'tags', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', ct.id, 'tag', ct.tag, 'color', ct.color))
        FROM contact_tags ct
        WHERE ct.contact_id = c.id
      ), '[]'::jsonb)
    ) ORDER BY c.last_name ASC NULLS LAST, c.first_name ASC NULLS LAST, c.company_name ASC NULLS LAST), '[]'::jsonb),
    'total', count(*)
  )
  INTO v_result
  FROM contacts c
  LEFT JOIN profiles p ON p.id = c.assigned_to
  LEFT JOIN company_offices co ON co.id = c.office_id
  LEFT JOIN (
    SELECT i.contact_id, COALESCE(SUM(i.amount_due), 0) AS balance_due
    FROM invoices i
    WHERE i.status NOT IN ('voided', 'paid')
      AND i.organization_id = v_org_id
    GROUP BY i.contact_id
  ) b ON b.contact_id = c.id
  WHERE c.organization_id = v_org_id
    AND (
      p_view_filter <> 'my'
      OR (c.created_by = auth.uid() OR c.assigned_to = auth.uid())
    )
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
  LIMIT GREATEST(0, LEAST(COALESCE(p_limit, 50), 200));

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_contacts_with_balance(int, text, text, text, text, uuid) TO authenticated;
