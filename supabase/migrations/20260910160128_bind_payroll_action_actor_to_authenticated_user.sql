/* Prevent clients from supplying another administrator as the action actor. */
CREATE OR REPLACE FUNCTION public.reopen_pay_period(p_pay_period_id uuid, p_reopened_by uuid, p_reopen_reason text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_org_id uuid; v_status text; v_caller_org_id uuid;
BEGIN
  IF p_reopened_by IS NULL OR p_reopened_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Unauthorized reopen actor'; END IF;
  SELECT organization_id, status INTO v_org_id, v_status FROM pay_periods WHERE id=p_pay_period_id;
  IF NOT FOUND THEN RETURN json_build_object('error','pay period not found'); END IF;
  SELECT organization_id INTO v_caller_org_id FROM profiles WHERE id=auth.uid();
  IF NOT FOUND OR v_caller_org_id IS DISTINCT FROM v_org_id THEN RAISE EXCEPTION 'Unauthorized: caller does not belong to this organization'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND organization_id=v_org_id AND role IN ('admin','manager','office_manager','production_manager','service_manager')) THEN RAISE EXCEPTION 'Unauthorized: caller is not authorized to reopen payroll'; END IF;
  IF v_status != 'payroll_approved' THEN RETURN json_build_object('error','Only payroll_approved periods can be reopened'); END IF;
  IF p_reopen_reason IS NULL OR btrim(p_reopen_reason)='' THEN RAISE EXCEPTION 'A non-empty reopen reason is required'; END IF;
  PERFORM set_config('app.reopen_authorized','true',true);
  PERFORM set_config('app.reopen_pay_period_id',p_pay_period_id::text,true);
  UPDATE pay_periods SET status='needs_review', payroll_approved_at=NULL, payroll_approved_by=NULL, reopened_by=auth.uid(), reopened_at=now(), reopen_reason=p_reopen_reason, updated_at=now() WHERE id=p_pay_period_id;
  UPDATE payroll_time_segments SET is_locked=false, locked_at=NULL, payroll_approval_status='pending', payroll_approved_by=NULL, payroll_approved_at=NULL WHERE pay_period_id=p_pay_period_id AND organization_id=v_org_id;
  RETURN json_build_object('success',true,'message','Pay period reopened to needs_review');
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_payroll_period(p_pay_period_id uuid, p_approved_by uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_org_id uuid; v_status text; v_caller_org_id uuid; v_readiness json; v_approved_count int := 0;
BEGIN
  IF p_approved_by IS NULL OR p_approved_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Unauthorized approval actor'; END IF;
  SELECT organization_id, status INTO v_org_id, v_status FROM pay_periods WHERE id=p_pay_period_id;
  IF NOT FOUND THEN RETURN json_build_object('error','pay period not found'); END IF;
  SELECT organization_id INTO v_caller_org_id FROM profiles WHERE id=auth.uid();
  IF NOT FOUND OR v_caller_org_id IS DISTINCT FROM v_org_id THEN RAISE EXCEPTION 'Unauthorized: caller does not belong to this organization'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND organization_id=v_org_id AND role IN ('admin','manager','office_manager','production_manager','service_manager')) THEN RAISE EXCEPTION 'Unauthorized: caller is not authorized to approve payroll'; END IF;
  IF v_status NOT IN ('needs_review') THEN RETURN json_build_object('error','Pay period must be in needs_review status to approve'); END IF;
  SELECT check_payroll_readiness(p_pay_period_id) INTO v_readiness;
  IF (v_readiness->>'ready_for_submission')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Cannot approve payroll: readiness check failed. Unassigned jurisdiction: %, GPS mismatches: %, Pending approvals: %, Pending adjustments: %, Unreviewed configs: %, Unresolved payroll flags: %', v_readiness->>'unassigned_jurisdiction', v_readiness->>'gps_mismatches', v_readiness->>'pending_count', v_readiness->>'pending_adjustments', v_readiness->>'unreviewed_timekeeping_configs', v_readiness->>'unresolved_payroll_flags'; END IF;
  UPDATE pay_periods SET status='payroll_approved', payroll_approved_at=now(), payroll_approved_by=auth.uid(), updated_at=now() WHERE id=p_pay_period_id;
  UPDATE payroll_time_segments SET is_locked=true, locked_at=now(), payroll_approval_status='approved', payroll_approved_by=auth.uid(), payroll_approved_at=now() WHERE pay_period_id=p_pay_period_id AND organization_id=v_org_id;
  GET DIAGNOSTICS v_approved_count=ROW_COUNT;
  RETURN json_build_object('success',true,'segments_locked',v_approved_count,'message','Pay period approved and segments locked');
END;
$function$;
