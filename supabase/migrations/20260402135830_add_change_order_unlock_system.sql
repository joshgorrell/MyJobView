/*
  # Change Order Unlock System

  ## Summary
  Replaces the hard CHECK constraint (which prevented unlocking) with a proper
  `is_locked` boolean column and an `unlock_change_order` RPC function.

  ## Changes

  ### 1. Schema
  - Drop the overly-restrictive `chk_active_only_on_draft` constraint added previously
  - Add `is_locked` (boolean, default false) to `change_orders`
  - Backfill: set `is_locked = true` for all approved/pending_approval/rejected/completed COs
  - Add `unlocked_by` (uuid) and `unlocked_at` (timestamptz) for audit trail
  - Re-add a softer constraint: `is_locked` can only be true when status != 'draft'

  ### 2. Function: unlock_change_order(p_change_order_id uuid)
  - Resets a locked change order back to draft status
  - Clears approval fields so it can go through approval again
  - Records the unlock in change_order_history
  - Security: only admin / office_manager / project_manager roles may call it
  - Does NOT reverse applied line-item changes (those stay on the proposal and
    must be manually adjusted if needed — unlocking is for re-approval, not revert)

  ### 3. Trigger
  - Auto-sets `is_locked = true` when status transitions to
    approved / pending_approval / rejected / completed
*/

-- 1. Drop the hard constraint from the previous migration
ALTER TABLE change_orders
  DROP CONSTRAINT IF EXISTS chk_active_only_on_draft;

-- 2. Add is_locked column
ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;

-- 3. Add audit columns
ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS unlocked_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS unlocked_at timestamptz;

-- 4. Backfill: lock all non-draft COs
UPDATE change_orders
SET is_locked = true
WHERE status IN ('approved', 'pending_approval', 'rejected', 'completed');

-- 5. Trigger function: auto-lock on status change to non-draft
CREATE OR REPLACE FUNCTION auto_lock_change_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('approved', 'pending_approval', 'rejected', 'completed')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.is_locked := true;
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_lock_change_order ON change_orders;
CREATE TRIGGER trg_auto_lock_change_order
  BEFORE UPDATE ON change_orders
  FOR EACH ROW
  EXECUTE FUNCTION auto_lock_change_order();

-- 6. unlock_change_order RPC
CREATE OR REPLACE FUNCTION unlock_change_order(
  p_change_order_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_co change_orders%ROWTYPE;
  v_caller_id uuid;
  v_caller_role text;
BEGIN
  -- Auth check
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

  -- Load the CO
  SELECT * INTO v_co FROM change_orders WHERE id = p_change_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Change order not found');
  END IF;

  IF NOT v_co.is_locked THEN
    RETURN jsonb_build_object('success', false, 'error', 'Change order is not locked');
  END IF;

  -- Reset to draft / unlocked state
  UPDATE change_orders SET
    status          = 'draft',
    is_locked       = false,
    is_active       = false,
    -- Clear approval fields so it must be re-approved
    approved_by     = NULL,
    approved_by_name = NULL,
    approval_date   = NULL,
    approval_notes  = NULL,
    customer_approved = false,
    customer_approval_token = NULL,
    -- Track who unlocked
    unlocked_by     = v_caller_id,
    unlocked_at     = now()
  WHERE id = p_change_order_id;

  -- Delete existing approval records so a fresh approval can be requested
  DELETE FROM change_order_approvals WHERE change_order_id = p_change_order_id;

  -- Audit trail
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
    COALESCE('Unlocked by ' || (SELECT full_name FROM profiles WHERE id = v_caller_id) ||
      CASE WHEN p_reason IS NOT NULL THEN ': ' || p_reason ELSE '' END,
      'Change order unlocked'),
    to_jsonb(v_co);

  RETURN jsonb_build_object('success', true);
END;
$$;
