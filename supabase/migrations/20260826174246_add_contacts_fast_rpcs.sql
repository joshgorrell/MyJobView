-- Two RPCs to replace the 9-query pattern on the Contacts page:
-- 1. get_contact_counts: returns all 8 filter counts in a single call
-- 2. get_contacts_with_balance: returns paginated contacts + balance_due in one query

-- ──────────────────────────────────────────────────────────────
-- 1. get_contact_counts
--    Returns: total, customers, prospects, leads,
--             on_fire, hot, warm, cold
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_contact_counts(
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
  v_base_filter text;
  v_result jsonb;
BEGIN
  -- Resolve org id once
  SELECT organization_id INTO v_org_id FROM profiles WHERE id = auth.uid();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'total', 0, 'customers', 0, 'prospects', 0, 'leads', 0,
      'on_fire', 0, 'hot', 0, 'warm', 0, 'cold', 0
    );
  END IF;

  -- Build base filter: org + optional "my" filter
  IF p_view_filter = 'my' AND p_user_id IS NOT NULL THEN
    v_base_filter := format(
      'organization_id = %L AND (created_by = %L OR assigned_to = %L)',
      v_org_id, p_user_id, p_user_id
    );
  ELSE
    v_base_filter := format('organization_id = %L', v_org_id);
  END IF;

  EXECUTE format($f$
    SELECT jsonb_build_object(
      'total',    count(*),
      'customers', count(*) FILTER (WHERE contact_type NOT IN ('lead','prospect')),
      'prospects',count(*) FILTER (WHERE contact_type = 'prospect'),
      'leads',    count(*) FILTER (WHERE contact_type = 'lead'),
      'on_fire',  count(*) FILTER (WHERE contact_type IN ('lead','prospect') AND temperature = 'on_fire'),
      'hot',      count(*) FILTER (WHERE contact_type IN ('lead','prospect') AND temperature = 'hot'),
      'warm',     count(*) FILTER (WHERE contact_type IN ('lead','prospect') AND temperature = 'warm'),
      'cold',     count(*) FILTER (WHERE contact_type IN ('lead','prospect') AND temperature = 'cold')
    )
    FROM contacts
    WHERE %s
  $f$, v_base_filter)
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_contact_counts(text, uuid) TO authenticated;


-- ──────────────────────────────────────────────────────────────
-- 2. get_contacts_with_balance
--    Returns paginated contacts with joined tags, creator, rep, office,
--    and balance_due (sum of unpaid non-voided invoices) in one query.
-- ──────────────────────────────────────────────────────────────
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
  v_base_where text;
  v_search_clause text := '';
  v_type_clause text := '';
  v_temp_clause text := '';
  v_query text;
  v_result jsonb;
BEGIN
  -- Resolve org id once
  SELECT organization_id INTO v_org_id FROM profiles WHERE id = auth.uid();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('contacts', '[]'::jsonb, 'total', 0);
  END IF;

  -- Base WHERE: org scoping
  v_base_where := format('c.organization_id = %L', v_org_id);

  -- View filter (my vs all)
  IF p_view_filter = 'my' AND p_user_id IS NOT NULL THEN
    v_base_where := v_base_where || format(' AND (c.created_by = %L OR c.assigned_to = %L)', p_user_id, p_user_id);
  END IF;

  -- Type filter
  IF p_type_filter = 'lead' THEN
    v_type_clause := ' AND c.contact_type = ''lead''';
  ELSIF p_type_filter = 'prospect' THEN
    v_type_clause := ' AND c.contact_type = ''prospect''';
  ELSIF p_type_filter = 'customer' THEN
    v_type_clause := ' AND c.contact_type NOT IN (''lead'',''prospect'')';
  END IF;

  -- Temperature filter
  IF p_temperature_filter != 'all' THEN
    v_temp_clause := format(' AND c.temperature = %L', p_temperature_filter);
    IF p_type_filter = 'all' THEN
      v_temp_clause := v_temp_clause || ' AND c.contact_type IN (''lead'',''prospect'')';
    END IF;
  END IF;

  -- Search clause
  IF p_search IS NOT NULL AND trim(p_search) <> '' THEN
    v_search_clause := format(
      ' AND (c.first_name ILIKE ''%%%s%%'' OR c.last_name ILIKE ''%%%s%%'' OR c.contact_name ILIKE ''%%%s%%'' OR c.company_name ILIKE ''%%%s%%'' OR c.email ILIKE ''%%%s%%'' OR c.phone ILIKE ''%%%s%%'')',
      p_search, p_search, p_search, p_search, p_search, p_search
    );
  END IF;

  -- Build the full query
  v_query := format($f$
    WITH balance AS (
      SELECT i.contact_id,
             COALESCE(SUM(i.amount_due), 0) AS balance_due
      FROM invoices i
      WHERE i.status NOT IN (''voided'', ''paid'')
        AND i.organization_id = %L
      GROUP BY i.contact_id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
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
      'assigned_rep_name', COALESCE(p.first_name || '' '' || p.last_name, p.first_name, p.last_name, ''),
      'office_name', COALESCE(co.office_name, ''),
      'balance_due', COALESCE(b.balance_due, 0),
      'tags', COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('id', ct.id, 'tag', ct.tag, 'color', ct.color))
         FROM contact_tags ct WHERE ct.contact_id = c.id),
        '[]'::jsonb
      )
    )), '[]'::jsonb) AS contacts,
    count(*)::int AS total
    FROM contacts c
    LEFT JOIN profiles p ON p.id = c.assigned_to
    LEFT JOIN company_offices co ON co.id = c.office_id
    LEFT JOIN balance b ON b.contact_id = c.id
    WHERE %s%s%s%s
    ORDER BY c.last_name ASC NULLS LAST, c.first_name ASC NULLS LAST, c.company_name ASC NULLS LAST
    LIMIT %s
  $f$, v_org_id, v_base_where, v_type_clause, v_temp_clause, v_search_clause, p_limit);

  EXECUTE v_query INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_contacts_with_balance(int, text, text, text, text, uuid) TO authenticated;
