/*
# Add time_clock_access column to employee_payroll_configs

## Purpose
Introduces a per-employee "Time Clock Access" setting that controls whether
the time clock icon on the website opens the web clock, the mobile app, or both.

## Changes
1. New column on `employee_payroll_configs`:
   - `time_clock_access` (text, NOT NULL, DEFAULT 'both')
     - Allowed values: 'web', 'mobile', 'both'
   - A CHECK constraint enforces the allowed values.

2. Existing rows are backfilled to 'both' so current behavior is unchanged
   (everyone keeps web access until an admin changes it).

3. The two RPC functions that create/update payroll configs
   (`classify_as_employee` and `update_employee_and_config`) are replaced with
   versions that accept a new `p_time_clock_access` parameter and persist it.

## Security
- No RLS policy changes. The table already has RLS enabled with existing
  ownership-scoped policies. The new column is covered by those existing
  policies since it lives on the same row.
- The updated RPC functions retain their existing authorization checks
  (caller must be admin/manager and belong to the same organization).

## Important notes
1. The DEFAULT is 'both' so all existing employees keep web clock access
   until an admin explicitly changes the setting.
2. The application will default technicians to 'mobile' when creating NEW
   employee records (the role-based default is applied in the frontend, not
   in the database, so admins can override at creation time).
*/

-- 1. Add the column with a safe default
ALTER TABLE employee_payroll_configs
  ADD COLUMN IF NOT EXISTS time_clock_access text NOT NULL DEFAULT 'both';

-- 2. Backfill any nulls / existing rows (defensive — DEFAULT already covers new rows)
UPDATE employee_payroll_configs
  SET time_clock_access = 'both'
  WHERE time_clock_access IS NULL OR time_clock_access NOT IN ('web', 'mobile', 'both');

-- 3. CHECK constraint for allowed values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employee_payroll_configs_time_clock_access_check'
  ) THEN
    ALTER TABLE employee_payroll_configs
      ADD CONSTRAINT employee_payroll_configs_time_clock_access_check
      CHECK (time_clock_access IN ('web', 'mobile', 'both'));
  END IF;
END $$;

-- 4. Update classify_as_employee to accept and persist p_time_clock_access
DROP FUNCTION IF EXISTS classify_as_employee(
  p_user_id uuid,
  p_hire_date date,
  p_employee_number text,
  p_employment_status text,
  p_compensation_type text,
  p_requires_daily_clock boolean,
  p_requires_time_allocation boolean,
  p_payroll_time_basis text,
  p_expected_weekly_hours numeric,
  p_standard_start_time text,
  p_standard_end_time text,
  p_work_days text[],
  p_overtime_eligible boolean,
  p_pto_eligible boolean,
  p_pay_schedule_id uuid,
  p_reviewed_by uuid
);

CREATE FUNCTION classify_as_employee(
  p_user_id uuid,
  p_hire_date date,
  p_employee_number text,
  p_employment_status text,
  p_compensation_type text,
  p_requires_daily_clock boolean,
  p_requires_time_allocation boolean,
  p_payroll_time_basis text,
  p_expected_weekly_hours numeric,
  p_standard_start_time text,
  p_standard_end_time text,
  p_work_days text[],
  p_overtime_eligible boolean,
  p_pto_eligible boolean,
  p_pay_schedule_id uuid,
  p_reviewed_by uuid,
  p_time_clock_access text DEFAULT 'both'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_org_id uuid; v_existing_emp uuid; v_new_emp_id uuid;
BEGIN
IF p_reviewed_by IS NULL OR p_reviewed_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Unauthorized classification actor'; END IF;
SELECT organization_id INTO v_org_id FROM profiles WHERE id = p_user_id;
IF NOT FOUND THEN RAISE EXCEPTION 'User profile not found'; END IF;
IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND organization_id = v_org_id AND role IN ('admin','manager','office_manager','production_manager','service_manager')) THEN RAISE EXCEPTION 'Unauthorized: caller cannot classify users'; END IF;
SELECT id INTO v_existing_emp FROM employees WHERE user_id = p_user_id AND organization_id = v_org_id;
IF v_existing_emp IS NOT NULL THEN
UPDATE profiles SET employment_classification = 'employee', employment_classification_reviewed_at = now(), employment_classification_reviewed_by = auth.uid() WHERE id = p_user_id;
RETURN json_build_object('success', true, 'employee_id', v_existing_emp, 'message', 'Employee classification confirmed');
END IF;
INSERT INTO employees (organization_id, user_id, employment_status, hire_date, termination_date, employee_number) VALUES (v_org_id, p_user_id, p_employment_status, p_hire_date, NULL, p_employee_number) RETURNING id INTO v_new_emp_id;
INSERT INTO employee_payroll_configs (organization_id, employee_id, effective_from, effective_to, compensation_type, requires_daily_clock, requires_time_allocation, payroll_time_basis, expected_weekly_hours, standard_start_time, standard_end_time, work_days, overtime_eligible, pto_eligible, pay_schedule_id, reviewed_at, reviewed_by, time_clock_access)
VALUES (v_org_id, v_new_emp_id, p_hire_date, NULL, p_compensation_type, p_requires_daily_clock, p_requires_time_allocation, p_payroll_time_basis, p_expected_weekly_hours, CASE WHEN p_requires_daily_clock THEN p_standard_start_time::time ELSE NULL END, CASE WHEN p_requires_daily_clock THEN p_standard_end_time::time ELSE NULL END, CASE WHEN array_length(p_work_days, 1) > 0 THEN p_work_days ELSE NULL END, p_overtime_eligible, p_pto_eligible, p_pay_schedule_id, now(), auth.uid(), COALESCE(p_time_clock_access, 'both'));
UPDATE profiles SET employment_classification = 'employee', employment_classification_reviewed_at = now(), employment_classification_reviewed_by = auth.uid() WHERE id = p_user_id;
RETURN json_build_object('success', true, 'employee_id', v_new_emp_id, 'message', 'Employee classification created');
END;
$$;

-- 5. Update update_employee_and_config to accept and persist p_time_clock_access
DROP FUNCTION IF EXISTS update_employee_and_config(
  p_user_id uuid,
  p_hire_date date,
  p_employee_number text,
  p_employment_status text,
  p_termination_date date,
  p_compensation_type text,
  p_requires_daily_clock boolean,
  p_requires_time_allocation boolean,
  p_payroll_time_basis text,
  p_expected_weekly_hours numeric,
  p_standard_start_time text,
  p_standard_end_time text,
  p_work_days text[],
  p_overtime_eligible boolean,
  p_pto_eligible boolean,
  p_pay_schedule_id uuid,
  p_effective_date date,
  p_reviewed_by uuid
);

CREATE FUNCTION update_employee_and_config(
  p_user_id uuid,
  p_hire_date date,
  p_employee_number text,
  p_employment_status text,
  p_termination_date date,
  p_compensation_type text,
  p_requires_daily_clock boolean,
  p_requires_time_allocation boolean,
  p_payroll_time_basis text,
  p_expected_weekly_hours numeric,
  p_standard_start_time text,
  p_standard_end_time text,
  p_work_days text[],
  p_overtime_eligible boolean,
  p_pto_eligible boolean,
  p_pay_schedule_id uuid,
  p_effective_date date,
  p_reviewed_by uuid,
  p_time_clock_access text DEFAULT 'both'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_org_id uuid; v_emp_id uuid; v_current_config record; v_config_changed boolean := false; v_eff_date date; v_new_start time; v_new_end time; v_new_work_days text[];
BEGIN
IF p_reviewed_by IS NULL OR p_reviewed_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Unauthorized employee update actor'; END IF;
SELECT p.organization_id, e.id INTO v_org_id, v_emp_id FROM profiles p JOIN employees e ON e.user_id = p.id AND e.organization_id = p.organization_id WHERE p.id = p_user_id;
IF NOT FOUND THEN RAISE EXCEPTION 'Employee record not found for user %', p_user_id; END IF;
IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND organization_id = v_org_id AND role IN ('admin','manager','office_manager','production_manager','service_manager')) THEN RAISE EXCEPTION 'Unauthorized: caller cannot update employees'; END IF;
UPDATE employees SET employment_status = p_employment_status, hire_date = p_hire_date, termination_date = p_termination_date, employee_number = p_employee_number, updated_at = now() WHERE id = v_emp_id;
SELECT * INTO v_current_config FROM employee_payroll_configs WHERE employee_id = v_emp_id AND effective_to IS NULL LIMIT 1;
v_new_start := CASE WHEN p_requires_daily_clock THEN p_standard_start_time::time ELSE NULL END;
v_new_end := CASE WHEN p_requires_daily_clock THEN p_standard_end_time::time ELSE NULL END;
v_new_work_days := CASE WHEN array_length(p_work_days, 1) > 0 THEN p_work_days ELSE NULL END;
IF v_current_config.id IS NULL THEN v_config_changed := true;
ELSE v_config_changed :=
  v_current_config.compensation_type IS DISTINCT FROM p_compensation_type
  OR v_current_config.requires_daily_clock IS DISTINCT FROM p_requires_daily_clock
  OR v_current_config.requires_time_allocation IS DISTINCT FROM p_requires_time_allocation
  OR v_current_config.payroll_time_basis IS DISTINCT FROM p_payroll_time_basis
  OR COALESCE(v_current_config.expected_weekly_hours, -1) IS DISTINCT FROM COALESCE(p_expected_weekly_hours, -1)
  OR COALESCE(v_current_config.standard_start_time, '00:00'::time) IS DISTINCT FROM COALESCE(v_new_start, '00:00'::time)
  OR COALESCE(v_current_config.standard_end_time, '00:00'::time) IS DISTINCT FROM COALESCE(v_new_end, '00:00'::time)
  OR COALESCE(array_to_string(v_current_config.work_days, ','), '') IS DISTINCT FROM COALESCE(array_to_string(v_new_work_days, ','), '')
  OR v_current_config.overtime_eligible IS DISTINCT FROM p_overtime_eligible
  OR v_current_config.pto_eligible IS DISTINCT FROM p_pto_eligible
  OR v_current_config.pay_schedule_id IS DISTINCT FROM p_pay_schedule_id
  OR COALESCE(v_current_config.time_clock_access, 'both') IS DISTINCT FROM COALESCE(p_time_clock_access, 'both');
END IF;
IF v_config_changed THEN
  v_eff_date := COALESCE(p_effective_date, CURRENT_DATE);
  IF v_current_config.id IS NOT NULL THEN UPDATE employee_payroll_configs SET effective_to = v_eff_date - 1 WHERE id = v_current_config.id; END IF;
  INSERT INTO employee_payroll_configs (organization_id, employee_id, effective_from, effective_to, compensation_type, requires_daily_clock, requires_time_allocation, payroll_time_basis, expected_weekly_hours, standard_start_time, standard_end_time, work_days, overtime_eligible, pto_eligible, pay_schedule_id, reviewed_at, reviewed_by, time_clock_access)
  VALUES (v_org_id, v_emp_id, v_eff_date, NULL, p_compensation_type, p_requires_daily_clock, p_requires_time_allocation, p_payroll_time_basis, p_expected_weekly_hours, v_new_start, v_new_end, v_new_work_days, p_overtime_eligible, p_pto_eligible, p_pay_schedule_id, now(), auth.uid(), COALESCE(p_time_clock_access, 'both'));
END IF;
UPDATE profiles SET employment_classification = 'employee', employment_classification_reviewed_at = now(), employment_classification_reviewed_by = auth.uid() WHERE id = p_user_id;
RETURN json_build_object('success', true, 'employee_id', v_emp_id, 'config_changed', v_config_changed);
END;
$$;
