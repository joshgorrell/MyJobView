-- Allow an authenticated portal customer to update only the duration of a view event
-- belonging to one of their own proposals. Internal users retain their normal DB access;
-- this RPC exists so portal RLS does not need broad UPDATE permission on proposal_activity.
CREATE OR REPLACE FUNCTION public.update_proposal_activity_duration(
  p_activity_id uuid,
  p_duration_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean := false;
BEGIN
  IF p_activity_id IS NULL OR p_duration_seconds IS NULL OR p_duration_seconds < 0 THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM proposal_activity pa
    JOIN proposals p ON p.id = pa.proposal_id
    JOIN profiles pr ON pr.contact_id = p.contact_id
    WHERE pa.id = p_activity_id
      AND pa.activity_type = 'viewed'
      AND pr.id = auth.uid()
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RETURN false;
  END IF;

  UPDATE proposal_activity
  SET duration_seconds = GREATEST(COALESCE(duration_seconds, 0), p_duration_seconds)
  WHERE id = p_activity_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.update_proposal_activity_duration(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_proposal_activity_duration(uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.update_proposal_activity_duration(uuid, integer) IS
  'Updates engagement duration for a customer view event after verifying the signed-in user owns the proposal contact.';
