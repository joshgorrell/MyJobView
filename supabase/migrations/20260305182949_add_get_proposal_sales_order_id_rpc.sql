/*
  # Add get_proposal_sales_order_id RPC

  ## Purpose
  Provides a SECURITY DEFINER function that returns the sales_order_id for a
  given proposal, bypassing RLS. Used as a fallback in the approval flow when
  the direct UPDATE response or polling fails to return the sales_order_id
  (which can happen due to RLS evaluation timing on the supabase-js client).

  The function still validates that the caller owns the proposal via their
  organization before returning data.
*/

CREATE OR REPLACE FUNCTION get_proposal_sales_order_id(p_proposal_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sales_order_id uuid;
  v_org_id uuid;
BEGIN
  -- Ensure the caller belongs to the same org as the proposal
  SELECT organization_id INTO v_org_id
  FROM profiles
  WHERE id = auth.uid();

  SELECT sales_order_id INTO v_sales_order_id
  FROM proposals
  WHERE id = p_proposal_id
    AND organization_id = v_org_id;

  RETURN v_sales_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_proposal_sales_order_id(uuid) TO authenticated;
