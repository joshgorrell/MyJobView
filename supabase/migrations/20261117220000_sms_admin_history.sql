-- Read-only dealer history without exposing recipient numbers or SMS bodies.
-- SECURITY DEFINER is necessary because dispatch ledger remains service-role private.
CREATE OR REPLACE FUNCTION public.get_sms_dispatch_history(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid, category text, status text, attempts integer,
  last_error_code text, created_at timestamptz,
  accepted_at timestamptz, delivered_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_org uuid;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid())
    AND p.role IN ('admin', 'manager');
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Not authorized to view SMS history' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT q.id, q.category, q.status, q.attempts, q.last_error_code,
    q.created_at, q.accepted_at, q.delivered_at
  FROM public.sms_dispatch_queue q
  WHERE q.organization_id = v_org
  ORDER BY q.created_at DESC, q.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
END;
$$;
REVOKE ALL ON FUNCTION public.get_sms_dispatch_history(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sms_dispatch_history(integer) TO authenticated;
COMMENT ON FUNCTION public.get_sms_dispatch_history(integer) IS
  'Admin/manager scoped SMS metadata only; never exposes message body, phone, or provider secrets.';
