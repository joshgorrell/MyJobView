/*
  # Fix unlock_change_order function

  ## Problem
  The unlock_change_order function references column `customer_approval_token`
  which does not exist on the change_orders table, causing an error when
  trying to unlock any change order.

  ## Fix
  Recreate the function without the customer_approval_token reference.
*/

CREATE OR REPLACE FUNCTION public.unlock_change_order(
  p_change_order_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_co change_orders%ROWTYPE;
  v_caller_id uuid;
  v_caller_role text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT role INTO v_caller_role
  FROM profiles
  WHERE id = v_caller_id;

  IF v_caller_role NOT IN ('admin', 'office_manager', 'project_manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions to unlock change orders');
  END IF;

  SELECT * INTO v_co FROM change_orders WHERE id = p_change_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Change order not found');
  END IF;

  IF NOT v_co.is_locked THEN
    RETURN jsonb_build_object('success', false, 'error', 'Change order is not locked');
  END IF;

  UPDATE change_orders SET
    status           = 'draft',
    is_locked        = false,
    is_active        = false,
    approved_by      = NULL,
    approved_by_name = NULL,
    approval_date    = NULL,
    approval_notes   = NULL,
    customer_approved = false,
    unlocked_by      = v_caller_id,
    unlocked_at      = now()
  WHERE id = p_change_order_id;

  DELETE FROM change_order_approvals WHERE change_order_id = p_change_order_id;

  INSERT INTO change_order_history (
    change_order_id,
    organization_id,
    action,
    performed_by,
    description,
    snapshot
  )
  SELECT
    p_change_order_id,
    v_co.organization_id,
    'status_changed',
    v_caller_id,
    COALESCE(
      'Unlocked by ' || (SELECT full_name FROM profiles WHERE id = v_caller_id) ||
      CASE WHEN p_reason IS NOT NULL THEN ': ' || p_reason ELSE '' END,
      'Change order unlocked'
    ),
    to_jsonb(v_co);

  RETURN jsonb_build_object('success', true);
END;
$$;
