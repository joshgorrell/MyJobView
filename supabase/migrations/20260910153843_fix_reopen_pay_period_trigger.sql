/*
# Fix reopen_pay_period to handle locked segment trigger

## Purpose
The prevent_locked_segment_modification trigger blocks updates to locked segments.
The reopen function needs to unlock segments, which requires temporarily disabling
the trigger or using a different approach.

## Solution
Use ALTER TABLE DISABLE/ENABLE TRIGGER within the SECURITY DEFINER function.
*/
CREATE OR REPLACE FUNCTION public.reopen_pay_period(
  p_pay_period_id uuid,
  p_reopened_by uuid,
  p_reopen_reason text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_status text;
BEGIN
  SELECT organization_id, status
  INTO v_org_id, v_status
  FROM pay_periods
  WHERE id = p_pay_period_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'pay period not found');
  END IF;

  IF v_status != 'payroll_approved' THEN
    RETURN json_build_object('error', 'Only payroll_approved periods can be reopened');
  END IF;

  -- Set status to needs_review and record reopen audit trail
  UPDATE pay_periods
  SET
    status = 'needs_review',
    payroll_approved_at = NULL,
    payroll_approved_by = NULL,
    reopened_by = p_reopened_by,
    reopened_at = now(),
    reopen_reason = p_reopen_reason,
    updated_at = now()
  WHERE id = p_pay_period_id;

  -- Temporarily disable the lock trigger to unlock segments
  ALTER TABLE payroll_time_segments DISABLE TRIGGER trg_pts_prevent_locked_update;

  -- Unlock all segments in this period
  UPDATE payroll_time_segments
  SET
    is_locked = false,
    locked_at = NULL,
    payroll_approval_status = 'pending',
    payroll_approved_by = NULL,
    payroll_approved_at = NULL
  WHERE pay_period_id = p_pay_period_id
    AND organization_id = v_org_id;

  -- Re-enable the trigger
  ALTER TABLE payroll_time_segments ENABLE TRIGGER trg_pts_prevent_locked_update;

  RETURN json_build_object(
    'success', true,
    'message', 'Pay period reopened to needs_review'
  );
END;
$function$;
