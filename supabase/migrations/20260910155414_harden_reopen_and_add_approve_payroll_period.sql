/*
# Harden locked-segment trigger + replace reopen_pay_period + create approve_payroll_period

## Purpose
1. Replace the global ALTER TABLE DISABLE TRIGGER approach with a narrowly scoped,
   transaction-local session variable that the trigger checks.
2. The trigger requires BOTH the session variable AND that the update is unlocking
   segments for the exact pay_period_id matching the session variable.
3. Create approve_payroll_period() that enforces readiness server-side.

## Trigger bypass design
- The trigger function checks: current_setting('app.reopen_pay_period_id', true) = segment's pay_period_id
  AND current_setting('app.reopen_authorized', true) = 'true'
- Only reopen_pay_period() (SECURITY DEFINER) sets these variables via set_config(..., true) (local)
- Normal application updates never set these variables, so the trigger always blocks them
- The variables are transaction-local, so they automatically clear at COMMIT/ROLLBACK
*/

-- ============================================================================
-- Replace the trigger function to allow scoped bypass
-- ============================================================================
CREATE OR REPLACE FUNCTION public.prevent_locked_segment_modification()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_reopen_period_id text;
  v_reopen_authorized text;
BEGIN
  IF OLD.is_locked = true THEN
    -- Check if this update is happening under an authorized reopen context
    v_reopen_period_id := current_setting('app.reopen_pay_period_id', true);
    v_reopen_authorized := current_setting('app.reopen_authorized', true);

    -- Both conditions must be met: authorized context AND exact pay_period_id match
    -- AND the update is actually unlocking (NEW.is_locked = false)
    IF v_reopen_authorized = 'true'
       AND v_reopen_period_id IS NOT NULL
       AND v_reopen_period_id = OLD.pay_period_id::text
       AND NEW.is_locked = false
    THEN
      -- Authorized reopen of this exact pay period — allow the unlock
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Cannot modify locked payroll time segment %. Use the correction workflow instead.', OLD.id;
  END IF;
  RETURN NEW;
END;
$function$;

-- ============================================================================
-- Replace reopen_pay_period with hardened implementation
-- ============================================================================
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
  v_caller_org_id uuid;
BEGIN
  -- 1. Verify the pay period exists and get its organization
  SELECT organization_id, status
  INTO v_org_id, v_status
  FROM pay_periods
  WHERE id = p_pay_period_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'pay period not found');
  END IF;

  -- 2. Verify caller's tenant ownership
  SELECT organization_id INTO v_caller_org_id
  FROM profiles
  WHERE id = p_reopened_by;

  IF NOT FOUND OR v_caller_org_id IS DISTINCT FROM v_org_id THEN
    RAISE EXCEPTION 'Unauthorized: caller does not belong to this organization';
  END IF;

  -- 3. Verify caller is authorized (admin or manager role)
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_reopened_by
      AND organization_id = v_org_id
      AND role IN ('admin', 'manager', 'office_manager', 'production_manager', 'service_manager')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: caller is not authorized to reopen payroll';
  END IF;

  -- 4. Require status = payroll_approved
  IF v_status != 'payroll_approved' THEN
    RETURN json_build_object('error', 'Only payroll_approved periods can be reopened');
  END IF;

  -- 5. Require non-empty reason
  IF p_reopen_reason IS NULL OR btrim(p_reopen_reason) = '' THEN
    RAISE EXCEPTION 'A non-empty reopen reason is required';
  END IF;

  -- 6. Set transaction-local bypass context (only this function can set these)
  --    These are LOCAL = true, so they clear at transaction end
  PERFORM set_config('app.reopen_authorized', 'true', true);
  PERFORM set_config('app.reopen_pay_period_id', p_pay_period_id::text, true);

  -- 7. Update the pay period
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

  -- 8. Unlock only segments belonging to this exact pay period and organization
  --    The trigger will allow this because the bypass context matches
  UPDATE payroll_time_segments
  SET
    is_locked = false,
    locked_at = NULL,
    payroll_approval_status = 'pending',
    payroll_approved_by = NULL,
    payroll_approved_at = NULL
  WHERE pay_period_id = p_pay_period_id
    AND organization_id = v_org_id;

  -- Bypass context automatically clears at transaction end (LOCAL = true)

  RETURN json_build_object(
    'success', true,
    'message', 'Pay period reopened to needs_review'
  );
END;
$function$;

-- ============================================================================
-- Function: approve_payroll_period
-- Server-side payroll approval with readiness enforcement
-- Cannot be bypassed by the frontend
-- ============================================================================
CREATE OR REPLACE FUNCTION public.approve_payroll_period(
  p_pay_period_id uuid,
  p_approved_by uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_status text;
  v_caller_org_id uuid;
  v_readiness json;
  v_approved_count int := 0;
BEGIN
  -- 1. Verify the pay period exists and get its organization
  SELECT organization_id, status
  INTO v_org_id, v_status
  FROM pay_periods
  WHERE id = p_pay_period_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'pay period not found');
  END IF;

  -- 2. Verify caller's tenant ownership
  SELECT organization_id INTO v_caller_org_id
  FROM profiles
  WHERE id = p_approved_by;

  IF NOT FOUND OR v_caller_org_id IS DISTINCT FROM v_org_id THEN
    RAISE EXCEPTION 'Unauthorized: caller does not belong to this organization';
  END IF;

  -- 3. Verify caller is authorized (admin or manager role)
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_approved_by
      AND organization_id = v_org_id
      AND role IN ('admin', 'manager', 'office_manager', 'production_manager', 'service_manager')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: caller is not authorized to approve payroll';
  END IF;

  -- 4. Verify prior status is an allowed state (needs_review)
  IF v_status NOT IN ('needs_review') THEN
    RETURN json_build_object('error', 'Pay period must be in needs_review status to approve');
  END IF;

  -- 5. Call check_payroll_readiness — fail transactionally if not ready
  SELECT check_payroll_readiness(p_pay_period_id) INTO v_readiness;

  IF (v_readiness->>'ready_for_submission')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Cannot approve payroll: readiness check failed. Unassigned jurisdiction: %, GPS mismatches: %, Pending approvals: %, Pending adjustments: %, Unreviewed configs: %, Unresolved payroll flags: %',
      v_readiness->>'unassigned_jurisdiction',
      v_readiness->>'gps_mismatches',
      v_readiness->>'pending_count',
      v_readiness->>'pending_adjustments',
      v_readiness->>'unreviewed_timekeeping_configs',
      v_readiness->>'unresolved_payroll_flags';
  END IF;

  -- 6. Update pay period to payroll_approved
  UPDATE pay_periods
  SET
    status = 'payroll_approved',
    payroll_approved_at = now(),
    payroll_approved_by = p_approved_by,
    updated_at = now()
  WHERE id = p_pay_period_id;

  -- 7. Lock all segments in this period
  UPDATE payroll_time_segments
  SET
    is_locked = true,
    locked_at = now(),
    payroll_approval_status = 'approved',
    payroll_approved_by = p_approved_by,
    payroll_approved_at = now()
  WHERE pay_period_id = p_pay_period_id
    AND organization_id = v_org_id;

  GET DIAGNOSTICS v_approved_count = ROW_COUNT;

  RETURN json_build_object(
    'success', true,
    'segments_locked', v_approved_count,
    'message', 'Pay period approved and segments locked'
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reopen_pay_period TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_payroll_period TO authenticated;
