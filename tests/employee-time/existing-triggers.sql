-- Read-only snapshot of relevant existing production triggers, 2026-10-02.
-- Executed only against isolated test databases; no application data is included.

CREATE OR REPLACE FUNCTION public.check_home_clock_and_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
v_settings record;
v_profile record;
v_org_id uuid;
v_distance_in integer;
v_distance_out integer;
v_is_home_clock_in boolean := false;
v_is_home_clock_out boolean := false;
v_recipient record;
BEGIN
-- Get technician profile with home coordinates and org id
SELECT
id,
full_name,
home_latitude,
home_longitude,
home_address,
organization_id
INTO v_profile
FROM profiles
WHERE id = NEW.technician_id;

v_org_id := v_profile.organization_id;

-- Get company settings for this org
SELECT
home_clock_notification_enabled,
home_location_radius_meters,
home_clock_notification_roles
INTO v_settings
FROM company_settings
WHERE organization_id = v_org_id
LIMIT 1;

-- If no org-specific settings, fall back to any row
IF v_settings IS NULL THEN
SELECT
home_clock_notification_enabled,
home_location_radius_meters,
home_clock_notification_roles
INTO v_settings
FROM company_settings
LIMIT 1;
END IF;

-- Exit early if notifications are disabled
IF NOT COALESCE(v_settings.home_clock_notification_enabled, false) THEN
RETURN NEW;
END IF;

-- Check clock IN from home (only on INSERT or when clock_in changes)
IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.clock_in IS DISTINCT FROM NEW.clock_in))
AND NEW.clock_in IS NOT NULL
AND NEW.clock_in_latitude IS NOT NULL
AND NEW.clock_in_longitude IS NOT NULL
AND v_profile.home_latitude IS NOT NULL
AND v_profile.home_longitude IS NOT NULL THEN

v_distance_in := calculate_distance_meters(
NEW.clock_in_latitude,
NEW.clock_in_longitude,
v_profile.home_latitude,
v_profile.home_longitude
);

IF v_distance_in IS NOT NULL AND v_distance_in <= COALESCE(v_settings.home_location_radius_meters, 150) THEN
v_is_home_clock_in := true;
NEW.clocked_in_from_home := true;
END IF;
END IF;

-- Check clock OUT from home (only when clock_out changes)
IF TG_OP = 'UPDATE'
AND OLD.clock_out IS DISTINCT FROM NEW.clock_out
AND NEW.clock_out IS NOT NULL
AND NEW.clock_out_latitude IS NOT NULL
AND NEW.clock_out_longitude IS NOT NULL
AND v_profile.home_latitude IS NOT NULL
AND v_profile.home_longitude IS NOT NULL THEN

v_distance_out := calculate_distance_meters(
NEW.clock_out_latitude,
NEW.clock_out_longitude,
v_profile.home_latitude,
v_profile.home_longitude
);

IF v_distance_out IS NOT NULL AND v_distance_out <= COALESCE(v_settings.home_location_radius_meters, 150) THEN
v_is_home_clock_out := true;
NEW.clocked_out_from_home := true;
END IF;
END IF;

-- Send notifications for clock-in from home
IF v_is_home_clock_in THEN
FOR v_recipient IN
SELECT id
FROM profiles
WHERE organization_id = v_org_id
AND role = ANY(COALESCE(
v_settings.home_clock_notification_roles,
ARRAY['admin', 'office_manager', 'production_manager', 'service_manager']
))
LOOP
INSERT INTO notifications (
user_id,
type,
title,
body,
related_id,
organization_id
) VALUES (
v_recipient.id,
'home_clock',
'Clock In From Home',
v_profile.full_name || ' clocked in from home at ' ||
TO_CHAR(NEW.clock_in AT TIME ZONE 'America/Chicago', 'HH12:MI AM') ||
CASE
WHEN v_distance_in IS NOT NULL THEN ' (' || v_distance_in || 'm from home)'
ELSE ''
END,
NEW.id,
v_org_id
);
END LOOP;
END IF;

-- Send notifications for clock-out from home
IF v_is_home_clock_out THEN
FOR v_recipient IN
SELECT id
FROM profiles
WHERE organization_id = v_org_id
AND role = ANY(COALESCE(
v_settings.home_clock_notification_roles,
ARRAY['admin', 'office_manager', 'production_manager', 'service_manager']
))
LOOP
INSERT INTO notifications (
user_id,
type,
title,
body,
related_id,
organization_id
) VALUES (
v_recipient.id,
'home_clock',
'Clock Out From Home',
v_profile.full_name || ' clocked out from home at ' ||
TO_CHAR(NEW.clock_out AT TIME ZONE 'America/Chicago', 'HH12:MI AM') ||
CASE
WHEN v_distance_out IS NOT NULL THEN ' (' || v_distance_out || 'm from home)'
ELSE ''
END,
NEW.id,
v_org_id
);
END LOOP;
END IF;

RETURN NEW;
END;
$function$;
CREATE TRIGGER check_home_clock_trigger BEFORE INSERT OR UPDATE ON public.daily_clock_entries FOR EACH ROW EXECUTE FUNCTION check_home_clock_and_notify();
CREATE TRIGGER trigger_check_home_clock BEFORE INSERT OR UPDATE ON public.daily_clock_entries FOR EACH ROW EXECUTE FUNCTION check_home_clock_and_notify();

CREATE OR REPLACE FUNCTION public.notify_approvers_of_time_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_approver_ids uuid[];
v_approver_id  uuid;
v_tech_name    text;
v_session_type text;
v_hours        numeric;
v_title        text;
v_body         text;
BEGIN
-- Only fire on new pending_approval inserts
IF NEW.status <> 'pending_approval' THEN
RETURN NEW;
END IF;

-- Get approver list from company_settings
SELECT time_request_approver_ids
INTO v_approver_ids
FROM company_settings
LIMIT 1;

IF v_approver_ids IS NULL OR array_length(v_approver_ids, 1) IS NULL THEN
RETURN NEW;
END IF;

-- Resolve tech's display name
SELECT COALESCE(full_name, email, 'A technician')
INTO v_tech_name
FROM profiles
WHERE id = NEW.assigned_to;

v_session_type := CASE NEW.session_type
WHEN 'shop_time'  THEN 'Shop Time'
WHEN 'training'   THEN 'Training Time'
ELSE initcap(replace(NEW.session_type, '_', ' '))
END;

v_hours := COALESCE(NEW.predetermined_hours, 0);

v_title := v_tech_name || ' requested ' || v_session_type;
v_body  := v_session_type || ' request for ' ||
v_hours::text || ' hour(s)' ||
CASE WHEN NEW.request_reason IS NOT NULL AND NEW.request_reason <> ''
THEN ': ' || NEW.request_reason
ELSE ''
END;

-- Insert one notification per approver
FOREACH v_approver_id IN ARRAY v_approver_ids
LOOP
INSERT INTO notifications (user_id, type, title, body, related_id, is_read)
VALUES (
v_approver_id,
'internal_time_request_submitted',
v_title,
v_body,
NEW.id,
false
);
END LOOP;

RETURN NEW;
END;
$function$;
CREATE TRIGGER trigger_notify_approvers_time_request AFTER INSERT ON public.internal_time_sessions FOR EACH ROW EXECUTE FUNCTION notify_approvers_of_time_request();

CREATE OR REPLACE FUNCTION public.notify_tech_of_time_request_outcome()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_approver_name text;
v_session_type  text;
v_hours         numeric;
v_title         text;
v_body          text;
v_notif_type    text;
BEGIN
-- Fire when status transitions from pending_approval to completed (approved) or denied
IF OLD.status <> 'pending_approval' THEN
RETURN NEW;
END IF;
IF NEW.status NOT IN ('completed', 'denied') THEN
RETURN NEW;
END IF;

-- Resolve approver name
SELECT COALESCE(full_name, email, 'A manager')
INTO v_approver_name
FROM profiles
WHERE id = NEW.approved_by;

v_session_type := CASE NEW.session_type
WHEN 'shop_time'  THEN 'Shop Time'
WHEN 'training'   THEN 'Training Time'
ELSE initcap(replace(NEW.session_type, '_', ' '))
END;

v_hours := COALESCE(NEW.predetermined_hours, 0);

IF NEW.status = 'completed' THEN
v_notif_type := 'internal_time_request_approved';
v_title      := v_session_type || ' request approved';
v_body       := v_approver_name || ' approved your ' || v_session_type || ' request. ' ||
v_hours::text || 'h have been added to your payroll for ' ||
to_char(NEW.session_date::date, 'Mon DD') || '.';
ELSE
v_notif_type := 'internal_time_request_denied';
v_title      := v_session_type || ' request declined';
v_body       := v_approver_name || ' declined your ' || v_session_type || ' request.' ||
CASE WHEN NEW.denial_reason IS NOT NULL AND NEW.denial_reason <> ''
THEN ' Reason: ' || NEW.denial_reason
ELSE ''
END;
END IF;

INSERT INTO notifications (user_id, type, title, body, related_id, is_read)
VALUES (
NEW.assigned_to,
v_notif_type,
v_title,
v_body,
NEW.id,
false
);

RETURN NEW;
END;
$function$;
CREATE TRIGGER trigger_notify_tech_time_request_outcome AFTER UPDATE ON public.internal_time_sessions FOR EACH ROW EXECUTE FUNCTION notify_tech_of_time_request_outcome();


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
