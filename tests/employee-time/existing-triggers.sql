-- Read-only snapshot of relevant existing production triggers, 2026-10-02.
-- Executed only against isolated test databases; no application data is included.

CREATE OR REPLACE FUNCTION public.calculate_daily_clock_hours()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
IF NEW.clock_out IS NOT NULL AND (OLD.clock_out IS NULL OR NEW.clock_out != OLD.clock_out) THEN
NEW.total_hours = EXTRACT(EPOCH FROM (NEW.clock_out - NEW.clock_in)) / 3600.0 - (NEW.break_minutes / 60.0);
IF NEW.status = 'clocked_in' THEN
NEW.status = 'clocked_out';
END IF;
END IF;
NEW.updated_at = now();
RETURN NEW;
END;
$function$;

CREATE TRIGGER update_daily_clock_hours BEFORE UPDATE ON public.daily_clock_entries FOR EACH ROW EXECUTE FUNCTION calculate_daily_clock_hours();

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

CREATE TRIGGER trg_guard_epc_historical_fields BEFORE UPDATE ON public.employee_payroll_configs FOR EACH ROW EXECUTE FUNCTION guard_employee_config_historical_fields();

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

CREATE TRIGGER trg_guard_pay_period_status BEFORE UPDATE ON public.pay_periods FOR EACH ROW EXECUTE FUNCTION guard_pay_period_status_transition();

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

CREATE TRIGGER trg_guard_employment_classification BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_employment_classification();

CREATE OR REPLACE FUNCTION public.set_project_id_from_work_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_project_id uuid;
BEGIN
IF NEW.project_id IS NULL AND NEW.work_order_id IS NOT NULL THEN
SELECT project_id INTO v_project_id
FROM public.work_orders
WHERE id = NEW.work_order_id;

IF v_project_id IS NOT NULL THEN
NEW.project_id := v_project_id;
END IF;
END IF;

RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_time_entries_set_project_id BEFORE INSERT ON public.time_entries FOR EACH ROW EXECUTE FUNCTION set_project_id_from_work_order();

CREATE OR REPLACE FUNCTION public.enforce_work_order_scheduling_permissions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
caller_role TEXT;
bypass_guard TEXT;
BEGIN
-- Check if bypass is set (used by SECURITY DEFINER functions)
bypass_guard := current_setting('app.bypass_scheduling_guard', true);
IF bypass_guard = 'true' THEN
RETURN NEW;
END IF;

-- Only check if scheduling columns are actually being changed
IF (NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date)
OR (NEW.scheduled_start_time IS DISTINCT FROM OLD.scheduled_start_time)
OR (NEW.scheduled_end_time IS DISTINCT FROM OLD.scheduled_end_time)
OR (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN

-- Get caller's role
SELECT role INTO caller_role
FROM profiles
WHERE id = auth.uid();

IF caller_role IS NULL THEN
RAISE EXCEPTION 'Permission denied: unable to verify user role for scheduling changes';
END IF;

IF caller_role NOT IN ('admin', 'manager', 'service_manager') THEN
RAISE EXCEPTION 'Permission denied: only admin, manager, or service_manager can modify scheduling fields';
END IF;
END IF;

RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_work_order_scheduling_guard BEFORE UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION enforce_work_order_scheduling_permissions();
