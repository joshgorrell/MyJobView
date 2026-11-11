-- Existing function body preserved from deployed database, scoped to one organization.
CREATE OR REPLACE FUNCTION public.auto_clock_out_forgotten_entries_for_org(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_settings                record;
v_reset_at timestamptz;
v_penalty_entry record;
v_cutoff_time             time;
v_default_clock_out_time  time;
v_cutoff_timestamp        timestamptz;
v_penalty_points          integer;
v_affected_count          integer := 0;
v_job_entries_count       integer := 0;
v_execution_start         timestamptz := clock_timestamp();
v_execution_log_id        uuid;
v_entry_ids               uuid[]  := '{}';
v_tech_ids                uuid[]  := '{}';
v_tech_names              text[]  := '{}';
v_total_points            integer := 0;
v_admin_ids               uuid[]  := '{}';
v_notification_ids        uuid[]  := '{}';
v_notification_id         uuid;
v_admin_id                uuid;
v_execution_duration      integer;
v_timezone                text;
v_org_id                  uuid;
v_cutoff_date             date;
BEGIN
-- Get company settings including timezone
SELECT
organization_id,
auto_clock_out_enabled,
auto_clock_out_cutoff_time,
auto_clock_out_time,
forgot_clock_out_penalty_points,
home_clock_notification_roles,
rewards_reset_at,
COALESCE(timezone, 'America/Chicago') AS tz
INTO v_settings
FROM company_settings
WHERE organization_id = p_org_id
LIMIT 1;

IF v_settings IS NULL THEN
RETURN jsonb_build_object(
'success',           false,
'message',           'No company settings found',
'entries_processed', 0
);
END IF;

v_org_id   := p_org_id;
v_timezone := v_settings.tz;
v_reset_at := v_settings.rewards_reset_at;

IF NOT v_settings.auto_clock_out_enabled THEN
RETURN jsonb_build_object(
'success',           false,
'message',           'Auto clock-out is not enabled',
'entries_processed', 0
);
END IF;

v_cutoff_time            := COALESCE(v_settings.auto_clock_out_cutoff_time, '22:00:00'::time);
v_default_clock_out_time := COALESCE(v_settings.auto_clock_out_time,        '16:00:00'::time);
v_penalty_points         := COALESCE(v_settings.forgot_clock_out_penalty_points, -15);

-- Determine the cutoff date in the org's local timezone.
-- FIX: cast the date arithmetic result back to ::date — subtracting an interval
--      from a date returns `timestamp without time zone` in Postgres, not date,
--      so ::text would produce "YYYY-MM-DD 00:00:00" instead of "YYYY-MM-DD".
IF (now() AT TIME ZONE v_timezone)::time >= v_cutoff_time THEN
v_cutoff_date := (now() AT TIME ZONE v_timezone)::date;
ELSE
v_cutoff_date := ((now() AT TIME ZONE v_timezone)::date - interval '1 day')::date;
END IF;

-- Build the cutoff timestamptz from clean date + time strings
v_cutoff_timestamp := (v_cutoff_date::text || ' ' || v_cutoff_time::text)::timestamp
AT TIME ZONE v_timezone;

-- -------------------------------------------------------
-- STEP A: Process daily_clock_entries (home / office clock)
-- -------------------------------------------------------
WITH entries_to_process AS (
SELECT
dce.id,
dce.technician_id,
dce.clock_in,
dce.entry_date,
p.full_name,
p.requires_daily_clock,
p.standard_end_time,
-- FIX: cast (entry_date + interval '1 day') back to ::date before ::text
CASE
WHEN p.standard_end_time IS NOT NULL THEN
CASE
WHEN (dce.entry_date::text || ' ' || p.standard_end_time::text)::timestamp
AT TIME ZONE v_timezone > dce.clock_in
THEN (dce.entry_date::text || ' ' || p.standard_end_time::text)::timestamp
AT TIME ZONE v_timezone
ELSE ((dce.entry_date + interval '1 day')::date::text || ' ' || p.standard_end_time::text)::timestamp
AT TIME ZONE v_timezone
END
ELSE
CASE
WHEN (dce.entry_date::text || ' ' || v_default_clock_out_time::text)::timestamp
AT TIME ZONE v_timezone > dce.clock_in
THEN (dce.entry_date::text || ' ' || v_default_clock_out_time::text)::timestamp
AT TIME ZONE v_timezone
ELSE ((dce.entry_date + interval '1 day')::date::text || ' ' || v_default_clock_out_time::text)::timestamp
AT TIME ZONE v_timezone
END
END AS calculated_clock_out
FROM daily_clock_entries dce
JOIN profiles p ON p.id = dce.technician_id
WHERE dce.organization_id=v_org_id AND p.organization_id=v_org_id
AND dce.status = 'clocked_in'
AND dce.clock_in < v_cutoff_timestamp
AND p.requires_daily_clock = true
AND dce.auto_clocked_out = false
),
updated_entries AS (
UPDATE daily_clock_entries dce
SET
clock_out               = etp.calculated_clock_out,
status                  = 'clocked_out',
total_hours             = GREATEST(
0,
EXTRACT(EPOCH FROM (etp.calculated_clock_out - dce.clock_in)) / 3600
),
deduct_points           = (v_reset_at IS NULL OR etp.clock_in>=v_reset_at),
points_deducted         = CASE WHEN v_reset_at IS NOT NULL AND etp.clock_in<v_reset_at THEN 0 ELSE v_penalty_points END,
auto_clocked_out        = true,
auto_clocked_out_at     = now(),
auto_clock_out_approved = false,
notes = COALESCE(notes || E'\n', '') ||
'Auto-clocked out at ' ||
to_char(etp.calculated_clock_out AT TIME ZONE v_timezone, 'YYYY-MM-DD HH12:MI:SS AM TZ') ||
' (cutoff was ' || to_char(v_cutoff_timestamp AT TIME ZONE v_timezone, 'HH12:MI:SS AM') ||
'). Penalty: ' || CASE WHEN v_reset_at IS NOT NULL AND etp.clock_in<v_reset_at THEN 0 ELSE v_penalty_points END || ' points.'
FROM entries_to_process etp
WHERE dce.id = etp.id
AND etp.calculated_clock_out > dce.clock_in
RETURNING dce.id, dce.technician_id, dce.points_deducted, etp.full_name
)
SELECT
COALESCE(array_agg(id),                     '{}'),
COALESCE(array_agg(DISTINCT technician_id), '{}'),
COALESCE(array_agg(DISTINCT full_name),     '{}'),
COALESCE(SUM(ABS(points_deducted))::integer, 0)
INTO v_entry_ids, v_tech_ids, v_tech_names, v_total_points
FROM updated_entries;

v_affected_count := COALESCE(array_length(v_entry_ids, 1), 0);

-- -------------------------------------------------------
-- STEP B: Process open job time_entries (work-order clock)
-- -------------------------------------------------------
WITH job_entries_to_close AS (
SELECT
te.id,
te.technician_id,
te.clock_in,
te.entry_date,
-- FIX: same ::date cast on the +1 day branch
CASE
WHEN (te.entry_date::text || ' ' || v_default_clock_out_time::text)::timestamp
AT TIME ZONE v_timezone > te.clock_in
THEN (te.entry_date::text || ' ' || v_default_clock_out_time::text)::timestamp
AT TIME ZONE v_timezone
ELSE ((te.entry_date + interval '1 day')::date::text || ' ' || v_default_clock_out_time::text)::timestamp
AT TIME ZONE v_timezone
END AS calculated_clock_out
FROM time_entries te
WHERE te.organization_id=v_org_id
AND te.status = 'clocked_in'
AND te.clock_in < v_cutoff_timestamp
AND te.clock_out IS NULL
),
updated_job_entries AS (
UPDATE time_entries te
SET
clock_out   = jec.calculated_clock_out,
status      = 'draft',
total_hours = GREATEST(
0,
EXTRACT(EPOCH FROM (jec.calculated_clock_out - te.clock_in)) / 3600
),
notes = COALESCE(notes || E'\n', '') ||
'Auto-clocked out at ' ||
to_char(jec.calculated_clock_out AT TIME ZONE v_timezone, 'YYYY-MM-DD HH12:MI:SS AM TZ') ||
' (cutoff was ' || to_char(v_cutoff_timestamp AT TIME ZONE v_timezone, 'HH12:MI:SS AM') || ').'
FROM job_entries_to_close jec
WHERE te.id = jec.id
AND jec.calculated_clock_out > te.clock_in
RETURNING te.id
)
SELECT COUNT(*)::integer INTO v_job_entries_count FROM updated_job_entries;

-- -------------------------------------------------------
-- Award penalty points and notify admins
-- -------------------------------------------------------
IF v_affected_count > 0 THEN
FOR v_penalty_entry IN SELECT * FROM daily_clock_entries WHERE id=ANY(v_entry_ids) AND (v_reset_at IS NULL OR clock_in>=v_reset_at) LOOP
PERFORM private.post_reward_points(v_org_id,v_penalty_entry.technician_id,v_penalty_points,'admin_adjustment',v_penalty_entry.id,'Automatic forgotten clock-out penalty','forgotten_entry:'||v_penalty_entry.id);
END LOOP;

IF v_settings.home_clock_notification_roles IS NOT NULL
AND array_length(v_settings.home_clock_notification_roles, 1) > 0
THEN
SELECT COALESCE(array_agg(DISTINCT id), '{}')
INTO   v_admin_ids
FROM   profiles
WHERE organization_id=v_org_id AND is_active IS TRUE AND role = ANY(v_settings.home_clock_notification_roles);
ELSE
SELECT COALESCE(array_agg(DISTINCT id), '{}')
INTO   v_admin_ids
FROM   profiles
WHERE organization_id=v_org_id AND is_active IS TRUE AND role IN ('admin', 'owner');
END IF;

IF v_admin_ids IS NOT NULL AND array_length(v_admin_ids, 1) > 0 THEN
FOREACH v_admin_id IN ARRAY v_admin_ids LOOP
INSERT INTO notifications (
user_id, organization_id, type, title, body, related_id
) VALUES (
v_admin_id,
v_org_id,
'auto_clock_out',
'Auto Clock-Out: Needs Approval',
v_affected_count ||
' technician(s) were automatically clocked out and need approval before payroll. Click to review.',
NULL
)
RETURNING id INTO v_notification_id;

v_notification_ids := array_append(v_notification_ids, v_notification_id);
END LOOP;
END IF;
END IF;

-- -------------------------------------------------------
-- Log execution
-- -------------------------------------------------------
v_execution_duration := EXTRACT(EPOCH FROM (clock_timestamp() - v_execution_start)) * 1000;

INSERT INTO auto_clock_out_execution_log (
organization_id,
executed_at,
entries_processed,
entry_ids,
technician_ids,
technician_names,
total_points_deducted,
admin_notified,
admin_notification_ids,
success,
execution_duration_ms
) VALUES (
v_org_id,
v_execution_start,
v_affected_count,
COALESCE(v_entry_ids,        '{}'),
COALESCE(v_tech_ids,         '{}'),
COALESCE(v_tech_names,       '{}'),
COALESCE(v_total_points,     0),
COALESCE(array_length(v_admin_ids, 1), 0) > 0,
COALESCE(v_notification_ids, '{}'),
true,
v_execution_duration
)
RETURNING id INTO v_execution_log_id;

UPDATE company_settings SET last_auto_clock_out_run = v_execution_start WHERE organization_id=v_org_id;

RETURN jsonb_build_object(
'success',               true,
'execution_log_id',      v_execution_log_id,
'entries_processed',     v_affected_count,
'job_entries_closed',    v_job_entries_count,
'technician_ids',        v_tech_ids,
'technician_names',      v_tech_names,
'total_points_deducted', v_total_points,
'admin_notified',        COALESCE(array_length(v_admin_ids, 1), 0) > 0,
'notification_count',    COALESCE(array_length(v_notification_ids, 1), 0),
'executed_at',           v_execution_start,
'execution_duration_ms', v_execution_duration,
'cutoff_time',           v_cutoff_time::text,
'default_clock_out_time', v_default_clock_out_time::text,
'timezone',              v_timezone
);

EXCEPTION WHEN OTHERS THEN
BEGIN
INSERT INTO auto_clock_out_execution_log (
organization_id,
executed_at,
entries_processed,
entry_ids,
technician_ids,
technician_names,
success,
error_message
) VALUES (
p_org_id,
v_execution_start,
0, '{}', '{}', '{}',
false,
SQLERRM
);
EXCEPTION WHEN OTHERS THEN
NULL;
END;

RETURN jsonb_build_object(
'success',           false,
'message',           'Error: ' || SQLERRM,
'entries_processed', 0
);
END;
$function$
;

-- Process each dealer independently; preserve the existing cron entrypoint.
-- Each dealer's local timezone, cutoff, notifications, and penalties stay isolated.
CREATE OR REPLACE FUNCTION public.auto_clock_out_forgotten_entries()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $wrapper$
DECLARE
  v_org record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_processed integer := 0;
  v_failed integer := 0;
BEGIN
  FOR v_org IN SELECT organization_id FROM public.company_settings WHERE organization_id IS NOT NULL ORDER BY organization_id LOOP
    BEGIN
      v_result := public.auto_clock_out_forgotten_entries_for_org(v_org.organization_id);
      v_results := v_results || jsonb_build_array(jsonb_build_object('organization_id',v_org.organization_id,'result',v_result));
      IF COALESCE((v_result->>'success')::boolean,false) THEN
        v_processed := v_processed + COALESCE((v_result->>'entries_processed')::integer,0);
      ELSIF v_result->>'message' IS DISTINCT FROM 'Auto clock-out is not enabled' THEN
        v_failed := v_failed + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object('organization_id',v_org.organization_id,'success',false,'error',SQLERRM));
    END;
  END LOOP;
  RETURN jsonb_build_object('success',v_failed=0,'entries_processed',v_processed,'organizations',v_results,'failed_organizations',v_failed);
END;
$wrapper$;
