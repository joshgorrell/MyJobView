/*
# Add employment_classification to profiles + create atomic classification RPC functions

## Purpose
Distinguish "admin has not reviewed" from "admin confirmed non-employee" by adding
an explicit classification column to profiles. Provide server-side atomic functions
for Make Employee and Confirm Non-Employee transitions.

## Changes
1. Add employment_classification, employment_classification_reviewed_at, employment_classification_reviewed_by to profiles
2. Set all existing profiles to 'unreviewed'
3. Create classify_as_employee() RPC — atomically creates employee record, initial config, and updates profile classification
4. Create classify_as_non_employee() RPC — atomically updates profile classification + review audit
5. Create update_employee_and_config() RPC — atomically updates employee record, creates effective-dated config, updates classification
*/
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employment_classification text NOT NULL DEFAULT 'unreviewed',
  ADD COLUMN IF NOT EXISTS employment_classification_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS employment_classification_reviewed_by uuid;

-- Backfill: all existing profiles start as unreviewed
UPDATE public.profiles
SET employment_classification = 'unreviewed'
WHERE employment_classification IS NULL OR employment_classification = '';

-- Add constraint to enforce valid values
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_employment_classification_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_employment_classification_check
  CHECK (employment_classification IN ('unreviewed', 'employee', 'non_employee'));

-- Grant access
GRANT SELECT (employment_classification, employment_classification_reviewed_at, employment_classification_reviewed_by) ON public.profiles TO authenticated;
GRANT UPDATE (employment_classification, employment_classification_reviewed_at, employment_classification_reviewed_by) ON public.profiles TO authenticated;

-- ============================================================================
-- Function: classify_as_employee
-- Atomically: creates employee record, initial payroll config, updates profile classification
-- ============================================================================
CREATE OR REPLACE FUNCTION public.classify_as_employee(
  p_user_id uuid,
  p_hire_date date,
  p_employee_number text DEFAULT NULL,
  p_employment_status text DEFAULT 'active',
  p_compensation_type text DEFAULT 'hourly',
  p_requires_daily_clock boolean DEFAULT true,
  p_requires_time_allocation boolean DEFAULT false,
  p_payroll_time_basis text DEFAULT 'daily_clock',
  p_expected_weekly_hours numeric DEFAULT 40,
  p_standard_start_time text DEFAULT '08:00',
  p_standard_end_time text DEFAULT '17:00',
  p_work_days text[] DEFAULT ARRAY['monday','tuesday','wednesday','thursday','friday'],
  p_overtime_eligible boolean DEFAULT false,
  p_pto_eligible boolean DEFAULT false,
  p_pay_schedule_id uuid DEFAULT NULL,
  p_reviewed_by uuid DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_existing_emp uuid;
  v_new_emp_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  SELECT id INTO v_existing_emp
  FROM employees
  WHERE user_id = p_user_id AND organization_id = v_org_id;

  IF v_existing_emp IS NOT NULL THEN
    UPDATE profiles
    SET
      employment_classification = 'employee',
      employment_classification_reviewed_at = now(),
      employment_classification_reviewed_by = p_reviewed_by
    WHERE id = p_user_id;

    RETURN json_build_object('success', true, 'employee_id', v_existing_emp, 'message', 'Employee record already exists, classification updated');
  END IF;

  INSERT INTO employees (
    organization_id, user_id, employment_status, hire_date,
    termination_date, employee_number
  ) VALUES (
    v_org_id, p_user_id, p_employment_status, p_hire_date,
    NULL, p_employee_number
  )
  RETURNING id INTO v_new_emp_id;

  INSERT INTO employee_payroll_configs (
    organization_id, employee_id, effective_from, effective_to,
    compensation_type, requires_daily_clock, requires_time_allocation, payroll_time_basis,
    expected_weekly_hours, standard_start_time, standard_end_time, work_days,
    overtime_eligible, pto_eligible, pay_schedule_id,
    reviewed_at, reviewed_by
  ) VALUES (
    v_org_id, v_new_emp_id, p_hire_date, NULL,
    p_compensation_type, p_requires_daily_clock, p_requires_time_allocation, p_payroll_time_basis,
    p_expected_weekly_hours,
    CASE WHEN p_requires_daily_clock THEN p_standard_start_time ELSE NULL END,
    CASE WHEN p_requires_daily_clock THEN p_standard_end_time ELSE NULL END,
    CASE WHEN array_length(p_work_days, 1) > 0 THEN p_work_days ELSE NULL END,
    p_overtime_eligible, p_pto_eligible, p_pay_schedule_id,
    now(), p_reviewed_by
  );

  UPDATE profiles
  SET
    employment_classification = 'employee',
    employment_classification_reviewed_at = now(),
    employment_classification_reviewed_by = p_reviewed_by
  WHERE id = p_user_id;

  RETURN json_build_object(
    'success', true,
    'employee_id', v_new_emp_id,
    'message', 'Employee record and initial configuration created, profile classified as employee'
  );
END;
$function$;

-- ============================================================================
-- Function: classify_as_non_employee
-- Atomically: updates profile classification + review audit
-- ============================================================================
CREATE OR REPLACE FUNCTION public.classify_as_non_employee(
  p_user_id uuid,
  p_reviewed_by uuid DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_emp uuid;
BEGIN
  PERFORM 1 FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  SELECT id INTO v_existing_emp
  FROM employees
  WHERE user_id = p_user_id;

  UPDATE profiles
  SET
    employment_classification = 'non_employee',
    employment_classification_reviewed_at = now(),
    employment_classification_reviewed_by = p_reviewed_by
  WHERE id = p_user_id;

  RETURN json_build_object(
    'success', true,
    'message', CASE WHEN v_existing_emp IS NOT NULL
      THEN 'Profile reclassified as non_employee (existing employee record preserved)'
      ELSE 'Profile classified as non_employee'
    END
  );
END;
$function$;

-- ============================================================================
-- Function: update_employee_and_config
-- Atomically: updates employee record, creates effective-dated config if changed
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_employee_and_config(
  p_user_id uuid,
  p_hire_date date,
  p_employee_number text DEFAULT NULL,
  p_employment_status text DEFAULT 'active',
  p_termination_date date DEFAULT NULL,
  p_compensation_type text DEFAULT 'hourly',
  p_requires_daily_clock boolean DEFAULT true,
  p_requires_time_allocation boolean DEFAULT false,
  p_payroll_time_basis text DEFAULT 'daily_clock',
  p_expected_weekly_hours numeric DEFAULT 40,
  p_standard_start_time text DEFAULT '08:00',
  p_standard_end_time text DEFAULT '17:00',
  p_work_days text[] DEFAULT ARRAY['monday','tuesday','wednesday','thursday','friday'],
  p_overtime_eligible boolean DEFAULT false,
  p_pto_eligible boolean DEFAULT false,
  p_pay_schedule_id uuid DEFAULT NULL,
  p_effective_date date DEFAULT NULL,
  p_reviewed_by uuid DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_emp_id uuid;
  v_current_config record;
  v_config_changed boolean := false;
  v_eff_date date;
  v_day_before date;
  v_new_start text;
  v_new_end text;
  v_new_work_days text[];
BEGIN
  SELECT p.organization_id, e.id INTO v_org_id, v_emp_id
  FROM profiles p
  JOIN employees e ON e.user_id = p.id AND e.organization_id = p.organization_id
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee record not found for user %', p_user_id;
  END IF;

  UPDATE employees
  SET
    employment_status = p_employment_status,
    hire_date = p_hire_date,
    termination_date = p_termination_date,
    employee_number = p_employee_number,
    updated_at = now()
  WHERE id = v_emp_id;

  SELECT * INTO v_current_config
  FROM employee_payroll_configs
  WHERE employee_id = v_emp_id AND effective_to IS NULL
  LIMIT 1;

  v_new_start := CASE WHEN p_requires_daily_clock THEN p_standard_start_time ELSE NULL END;
  v_new_end := CASE WHEN p_requires_daily_clock THEN p_standard_end_time ELSE NULL END;
  v_new_work_days := CASE WHEN array_length(p_work_days, 1) > 0 THEN p_work_days ELSE NULL END;

  IF v_current_config IS NULL THEN
    v_config_changed := true;
  ELSE
    v_config_changed :=
      v_current_config.compensation_type IS DISTINCT FROM p_compensation_type
      OR v_current_config.requires_daily_clock IS DISTINCT FROM p_requires_daily_clock
      OR v_current_config.requires_time_allocation IS DISTINCT FROM p_requires_time_allocation
      OR v_current_config.payroll_time_basis IS DISTINCT FROM p_payroll_time_basis
      OR COALESCE(v_current_config.expected_weekly_hours, -1) IS DISTINCT FROM COALESCE(p_expected_weekly_hours, -1)
      OR COALESCE(v_current_config.standard_start_time, '') IS DISTINCT FROM COALESCE(v_new_start, '')
      OR COALESCE(v_current_config.standard_end_time, '') IS DISTINCT FROM COALESCE(v_new_end, '')
      OR COALESCE(array_to_string(v_current_config.work_days, ','), '') IS DISTINCT FROM COALESCE(array_to_string(v_new_work_days, ','), '')
      OR v_current_config.overtime_eligible IS DISTINCT FROM p_overtime_eligible
      OR v_current_config.pto_eligible IS DISTINCT FROM p_pto_eligible
      OR v_current_config.pay_schedule_id IS DISTINCT FROM p_pay_schedule_id;
  END IF;

  IF v_config_changed THEN
    v_eff_date := COALESCE(p_effective_date, CURRENT_DATE);
    v_day_before := v_eff_date - 1;

    IF v_current_config IS NOT NULL THEN
      UPDATE employee_payroll_configs
      SET effective_to = v_day_before
      WHERE id = v_current_config.id;
    END IF;

    INSERT INTO employee_payroll_configs (
      organization_id, employee_id, effective_from, effective_to,
      compensation_type, requires_daily_clock, requires_time_allocation, payroll_time_basis,
      expected_weekly_hours, standard_start_time, standard_end_time, work_days,
      overtime_eligible, pto_eligible, pay_schedule_id,
      reviewed_at, reviewed_by
    ) VALUES (
      v_org_id, v_emp_id, v_eff_date, NULL,
      p_compensation_type, p_requires_daily_clock, p_requires_time_allocation, p_payroll_time_basis,
      p_expected_weekly_hours, v_new_start, v_new_end, v_new_work_days,
      p_overtime_eligible, p_pto_eligible, p_pay_schedule_id,
      now(), p_reviewed_by
    );
  END IF;

  UPDATE profiles
  SET
    employment_classification = 'employee',
    employment_classification_reviewed_at = now(),
    employment_classification_reviewed_by = p_reviewed_by
  WHERE id = p_user_id AND employment_classification != 'employee';

  RETURN json_build_object(
    'success', true,
    'employee_id', v_emp_id,
    'config_changed', v_config_changed,
    'message', CASE WHEN v_config_changed THEN 'Employee updated with new effective-dated configuration' ELSE 'Employee updated, no config change' END
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.classify_as_employee TO authenticated;
GRANT EXECUTE ON FUNCTION public.classify_as_non_employee TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_employee_and_config TO authenticated;
