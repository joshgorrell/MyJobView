/*
# Create pay_schedules, employees, and employee_payroll_configs tables

## Purpose
Establishes the three-layer separation: Person/Profile (existing) -> Login Access (existing auth.users) -> Employee record (new) -> Effective-dated payroll configuration (new).

## New Tables

### 1. pay_schedules
Tenant-level pay schedule/group definitions. Supports weekly, biweekly, semimonthly, and monthly frequencies with concrete boundary rules.

- id (uuid, PK)
- organization_id (uuid, FK to organizations)
- name (text) — e.g. "Biweekly Field Staff"
- frequency (text, CHECK: weekly/biweekly/semimonthly/monthly)
- anchor_date (date, nullable) — cycle reference for weekly/biweekly/monthly
- semimonthly_first_day (int 1-28, nullable) — first pay period start day for semimonthly
- semimonthly_second_day (int 1-28, nullable) — second pay period start day for semimonthly
- pay_date_offset_days (int, default 0) — days after period end to pay date
- is_active (boolean, default true)
- created_at, updated_at (timestamptz)

### 2. employees
Employment identity/lifecycle only. No configuration fields — those live in employee_payroll_configs.

- id (uuid, PK)
- organization_id (uuid, FK to organizations)
- user_id (uuid, FK to profiles, NOT NULL, UNIQUE) — one employee per profile
- employee_number (text, nullable)
- employment_status (text, CHECK: active/inactive/terminated, default active)
- hire_date (date, NOT NULL)
- termination_date (date, nullable)
- created_at, updated_at (timestamptz)

### 3. employee_payroll_configs
Single authoritative source for all timekeeping/payroll configuration. Effective-dated so historical periods are never reinterpreted using current config.

- id (uuid, PK)
- organization_id (uuid, FK to organizations)
- employee_id (uuid, FK to employees ON DELETE CASCADE)
- effective_from (date, NOT NULL)
- effective_to (date, nullable) — null = current/open-ended
- compensation_type (text, CHECK: salary/hourly)
- requires_daily_clock (boolean, NOT NULL)
- requires_time_allocation (boolean, NOT NULL)
- payroll_time_basis (text, CHECK: salary/daily_clock/work_allocation)
- expected_weekly_hours (numeric, nullable)
- standard_start_time (time, nullable) — schedule effective on that date
- standard_end_time (time, nullable)
- work_days (text[], nullable) — e.g. {monday,tuesday,...}
- overtime_eligible (boolean, default false)
- pto_eligible (boolean, default false)
- pay_schedule_id (uuid, FK to pay_schedules, nullable)
- reviewed_at (timestamptz, nullable)
- reviewed_by (uuid, FK to profiles, nullable)
- created_at, updated_at (timestamptz)

## Security
- RLS enabled on all three tables.
- Policies scoped to authenticated users within the same organization.
- Only one open config (effective_to IS NULL) per employee enforced via partial unique index.

## Important Notes
1. employees table holds identity/lifecycle only — no compensation/timekeeping fields.
2. employee_payroll_configs is the single authoritative source for all payroll configuration.
3. Historical configs are never updated in place when a historically significant field changes.
4. The partial unique index on employee_payroll_configs ensures only one open-ended config per employee.
5. No data migration of existing profiles — admin explicitly classifies each profile as Employee or Non-Employee.
*/

-- 1. pay_schedules
CREATE TABLE IF NOT EXISTS pay_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  frequency text NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'semimonthly', 'monthly')),
  anchor_date date,
  semimonthly_first_day integer CHECK (semimonthly_first_day BETWEEN 1 AND 28),
  semimonthly_second_day integer CHECK (semimonthly_second_day BETWEEN 1 AND 28),
  pay_date_offset_days integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pay_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_pay_schedules" ON pay_schedules;
CREATE POLICY "select_pay_schedules" ON pay_schedules FOR SELECT
  TO authenticated USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "insert_pay_schedules" ON pay_schedules;
CREATE POLICY "insert_pay_schedules" ON pay_schedules FOR INSERT
  TO authenticated WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "update_pay_schedules" ON pay_schedules;
CREATE POLICY "update_pay_schedules" ON pay_schedules FOR UPDATE
  TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "delete_pay_schedules" ON pay_schedules;
CREATE POLICY "delete_pay_schedules" ON pay_schedules FOR DELETE
  TO authenticated USING (organization_id = get_user_org_id());

-- 2. employees
CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  user_id uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  employee_number text,
  employment_status text NOT NULL DEFAULT 'active' CHECK (employment_status IN ('active', 'inactive', 'terminated')),
  hire_date date NOT NULL,
  termination_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_employees" ON employees;
CREATE POLICY "select_employees" ON employees FOR SELECT
  TO authenticated USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "insert_employees" ON employees;
CREATE POLICY "insert_employees" ON employees FOR INSERT
  TO authenticated WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "update_employees" ON employees;
CREATE POLICY "update_employees" ON employees FOR UPDATE
  TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "delete_employees" ON employees;
CREATE POLICY "delete_employees" ON employees FOR DELETE
  TO authenticated USING (organization_id = get_user_org_id());

-- 3. employee_payroll_configs
CREATE TABLE IF NOT EXISTS employee_payroll_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  effective_to date,
  compensation_type text NOT NULL CHECK (compensation_type IN ('salary', 'hourly')),
  requires_daily_clock boolean NOT NULL,
  requires_time_allocation boolean NOT NULL,
  payroll_time_basis text NOT NULL CHECK (payroll_time_basis IN ('salary', 'daily_clock', 'work_allocation')),
  expected_weekly_hours numeric,
  standard_start_time time without time zone,
  standard_end_time time without time zone,
  work_days text[],
  overtime_eligible boolean NOT NULL DEFAULT false,
  pto_eligible boolean NOT NULL DEFAULT false,
  pay_schedule_id uuid REFERENCES pay_schedules(id),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE employee_payroll_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_employee_payroll_configs" ON employee_payroll_configs;
CREATE POLICY "select_employee_payroll_configs" ON employee_payroll_configs FOR SELECT
  TO authenticated USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "insert_employee_payroll_configs" ON employee_payroll_configs;
CREATE POLICY "insert_employee_payroll_configs" ON employee_payroll_configs FOR INSERT
  TO authenticated WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "update_employee_payroll_configs" ON employee_payroll_configs;
CREATE POLICY "update_employee_payroll_configs" ON employee_payroll_configs FOR UPDATE
  TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "delete_employee_payroll_configs" ON employee_payroll_configs;
CREATE POLICY "delete_employee_payroll_configs" ON employee_payroll_configs FOR DELETE
  TO authenticated USING (organization_id = get_user_org_id());

-- Partial unique index: only one open-ended config per employee
CREATE UNIQUE INDEX IF NOT EXISTS epc_one_open_config_per_employee
  ON employee_payroll_configs (employee_id)
  WHERE effective_to IS NULL;

-- Index for effective-date lookups
CREATE INDEX IF NOT EXISTS epc_employee_effective_date_idx
  ON employee_payroll_configs (employee_id, effective_from, effective_to);

-- Index for pay schedule lookups
CREATE INDEX IF NOT EXISTS epc_pay_schedule_idx
  ON employee_payroll_configs (pay_schedule_id);

-- Index for organization filtering
CREATE INDEX IF NOT EXISTS epc_organization_idx
  ON employee_payroll_configs (organization_id);

-- Index for employees organization filtering
CREATE INDEX IF NOT EXISTS employees_organization_idx
  ON employees (organization_id);

-- Index for employees by employment status
CREATE INDEX IF NOT EXISTS employees_status_idx
  ON employees (employment_status);

-- Index for pay schedules organization
CREATE INDEX IF NOT EXISTS pay_schedules_organization_idx
  ON pay_schedules (organization_id);
