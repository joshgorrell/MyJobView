/*
# Authorization-Bypass Protection for Payroll, Classification, and Config

## Purpose
Prevents ordinary authenticated application users from bypassing trusted
server-side workflows via direct table writes.  All protected transitions
must go through the SECURITY DEFINER RPC functions that already enforce
readiness checks, role authorization, tenant ownership, and audit trails.

## Changes

### 1. Pay Periods — status transition guard
- New trigger function `guard_pay_period_status_transition()` and trigger
  `trg_guard_pay_period_status` on `pay_periods`.
- Blocks any direct UPDATE that changes `status` to or from
  `'payroll_approved'` unless the current database role is `postgres`
  (which is the role under which the SECURITY DEFINER functions execute).
- Intermediate transitions (e.g. `draft` → `needs_review`) remain
  writable by ordinary clients — only the two critical transitions
  (`needs_review` → `payroll_approved` and `payroll_approved` → anything)
  are gated.

### 2. Profiles — employment_classification guard
- New trigger function `guard_employment_classification()` and trigger
  `trg_guard_employment_classification` on `profiles`.
- Blocks any direct UPDATE that changes `employment_classification`
  unless the current database role is `postgres`.
- The three classification RPCs (`classify_as_employee`,
  `classify_as_non_employee`, `update_employee_and_config`) all run as
  SECURITY DEFINER (postgres) and will pass; all direct client writes
  will fail.

### 3. Employee Payroll Configs — historical field guard
- New trigger function `guard_employee_config_historical_fields()` and
  trigger `trg_guard_epc_historical_fields` on `employee_payroll_configs`.
- Blocks any direct UPDATE that changes any of the following historically
  meaningful fields, on BOTH open and closed rows, unless the current
  database role is `postgres`:
    compensation_type, requires_daily_clock, requires_time_allocation,
    payroll_time_basis, expected_weekly_hours, standard_start_time,
    standard_end_time, work_days, overtime_eligible, pto_eligible,
    pay_schedule_id, effective_from, effective_to
- The trusted `update_employee_and_config` RPC closes the current row
  (sets `effective_to`) and inserts a successor — it never rewrites
  historical content, so it passes.
- Admin metadata fields not in the list above remain directly writable
  if needed (e.g. `reviewed_at`, `reviewed_by`, `updated_at`).

### 4. SECURITY DEFINER EXECUTE grants — restrict to authenticated
- REVOKE EXECUTE on all five trusted functions from PUBLIC and anon.
- GRANT EXECUTE only to authenticated.
- Internal authorization checks (auth.uid() as actor, tenant ownership
  verification, role checks) remain in place inside every function.

### 5. Reopen bypass — no change needed
- The existing `prevent_locked_segment_modification` trigger already
  requires `current_user = 'postgres'` plus exact transaction-local
  session variables.  An authenticated client calling `set_config()`
  cannot satisfy the `current_user = 'postgres'` check.
- No `ALTER TABLE ... DISABLE TRIGGER` exists anywhere in migrations.

## Security Notes
- All triggers check `current_user = 'postgres'` to allow SECURITY
  DEFINER functions to pass.  Ordinary authenticated clients run as
  the `authenticated` role and will be blocked.
- No privileges are broadened.  EXECUTE is narrowed from PUBLIC to
  authenticated-only.
- No UI changes are required — the UI already calls the RPC functions
  for these workflows.
*/

-- =========================================================
-- 1. Pay Periods: guard status transitions
-- =========================================================

CREATE OR REPLACE FUNCTION public.guard_pay_period_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
    -- SECURITY DEFINER functions run as postgres — allow them through.
    IF current_user = 'postgres' THEN
        RETURN NEW;
    END IF;

    -- Block any direct transition to or from 'payroll_approved'.
    IF OLD.status = 'payroll_approved' OR NEW.status = 'payroll_approved' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            RAISE EXCEPTION
                'Direct status transition % → % on pay_periods is not permitted. Use the approve_payroll_period() or reopen_pay_period() RPC.',
                COALESCE(OLD.status, '<null>'),
                COALESCE(NEW.status, '<null>');
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_pay_period_status ON public.pay_periods;
CREATE TRIGGER trg_guard_pay_period_status
    BEFORE UPDATE ON public.pay_periods
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_pay_period_status_transition();

-- =========================================================
-- 2. Profiles: guard employment_classification
-- =========================================================

CREATE OR REPLACE FUNCTION public.guard_employment_classification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
    -- SECURITY DEFINER functions run as postgres — allow them through.
    IF current_user = 'postgres' THEN
        RETURN NEW;
    END IF;

    -- Block any direct change to employment_classification.
    IF NEW.employment_classification IS DISTINCT FROM OLD.employment_classification THEN
        RAISE EXCEPTION
            'Direct change to profiles.employment_classification is not permitted. Use the classify_as_employee(), classify_as_non_employee(), or update_employee_and_config() RPC.';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_employment_classification ON public.profiles;
CREATE TRIGGER trg_guard_employment_classification
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_employment_classification();

-- =========================================================
-- 3. Employee Payroll Configs: guard historical fields
-- =========================================================

CREATE OR REPLACE FUNCTION public.guard_employee_config_historical_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
    -- SECURITY DEFINER functions run as postgres — allow them through.
    IF current_user = 'postgres' THEN
        RETURN NEW;
    END IF;

    -- Block direct changes to any historically meaningful field.
    IF
        NEW.compensation_type        IS DISTINCT FROM OLD.compensation_type
        OR NEW.requires_daily_clock     IS DISTINCT FROM OLD.requires_daily_clock
        OR NEW.requires_time_allocation IS DISTINCT FROM OLD.requires_time_allocation
        OR NEW.payroll_time_basis       IS DISTINCT FROM OLD.payroll_time_basis
        OR NEW.expected_weekly_hours    IS DISTINCT FROM OLD.expected_weekly_hours
        OR NEW.standard_start_time      IS DISTINCT FROM OLD.standard_start_time
        OR NEW.standard_end_time        IS DISTINCT FROM OLD.standard_end_time
        OR NEW.work_days                IS DISTINCT FROM OLD.work_days
        OR NEW.overtime_eligible        IS DISTINCT FROM OLD.overtime_eligible
        OR NEW.pto_eligible             IS DISTINCT FROM OLD.pto_eligible
        OR NEW.pay_schedule_id          IS DISTINCT FROM OLD.pay_schedule_id
        OR NEW.effective_from           IS DISTINCT FROM OLD.effective_from
        OR NEW.effective_to             IS DISTINCT FROM OLD.effective_to
    THEN
        RAISE EXCEPTION
            'Direct modification of historically significant employee_payroll_configs fields is not permitted. Use the update_employee_and_config() RPC to create an effective-dated successor.';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_epc_historical_fields ON public.employee_payroll_configs;
CREATE TRIGGER trg_guard_epc_historical_fields
    BEFORE UPDATE ON public.employee_payroll_configs
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_employee_config_historical_fields();

-- =========================================================
-- 4. Restrict EXECUTE on trusted SECURITY DEFINER functions
-- =========================================================

REVOKE EXECUTE ON FUNCTION public.approve_payroll_period(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_payroll_period(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.approve_payroll_period(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reopen_pay_period(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reopen_pay_period(uuid, uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.reopen_pay_period(uuid, uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.classify_as_employee(uuid, date, text, text, text, boolean, boolean, text, numeric, text, text, text[], boolean, boolean, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.classify_as_employee(uuid, date, text, text, text, boolean, boolean, text, numeric, text, text, text[], boolean, boolean, uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.classify_as_employee(uuid, date, text, text, text, boolean, boolean, text, numeric, text, text, text[], boolean, boolean, uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.classify_as_non_employee(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.classify_as_non_employee(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.classify_as_non_employee(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_employee_and_config(uuid, date, text, text, date, text, boolean, boolean, text, numeric, text, text, text[], boolean, boolean, uuid, date, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_employee_and_config(uuid, date, text, text, date, text, boolean, boolean, text, numeric, text, text, text[], boolean, boolean, uuid, date, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.update_employee_and_config(uuid, date, text, text, date, text, boolean, boolean, text, numeric, text, text, text[], boolean, boolean, uuid, date, uuid) TO authenticated;
