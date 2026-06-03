/*
  # Fix mark_proposal_activity_viewed to Handle NULL User ID
  
  1. Changes
    - Add check for NULL user_id and return early if not authenticated
    - This prevents errors when function is called without authentication context
    
  2. Purpose
    - Gracefully handle cases where auth.uid() returns NULL
    - Function should only work for authenticated users
*/

CREATE OR REPLACE FUNCTION mark_proposal_activity_viewed(
  p_proposal_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organization_id uuid;
  v_user_id uuid;
BEGIN
  -- Use provided user_id or get from auth context
  v_user_id := COALESCE(p_user_id, auth.uid());
  
  -- Return early if no user (not authenticated)
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Get organization_id from proposal
  SELECT organization_id INTO v_organization_id
  FROM proposals
  WHERE id = p_proposal_id;
  
  -- Return if proposal not found
  IF v_organization_id IS NULL THEN
    RETURN;
  END IF;

  -- Upsert the view record
  INSERT INTO proposal_activity_views (proposal_id, user_id, organization_id, last_viewed_at)
  VALUES (p_proposal_id, v_user_id, v_organization_id, now())
  ON CONFLICT (proposal_id, user_id)
  DO UPDATE SET
    last_viewed_at = now(),
    updated_at = now();
END;
$$;