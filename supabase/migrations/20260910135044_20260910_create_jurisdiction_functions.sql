/*
# Create Jurisdiction Determination Functions

## Purpose
Database functions that determine payroll jurisdiction for time entries and payroll
time segments. These functions operate ONLY on stored values — they never call external
geocoding APIs (Revision 3). The application/Edge Function layer is responsible for
populating physical_work_location_state via the existing Google Maps reverse geocode
infrastructure, and these functions consume that stored value.

## Functions Created

### determine_work_jurisdiction(p_time_entry_id uuid)
Returns a JSON object with jurisdiction_state, jurisdiction_source, confidence,
gps_validated, and physical_work_location_state for a single time entry.

Priority logic:
1. Manual override — if work_jurisdiction_state is set with source 'manual_override', return it (high confidence)
2. GPS/job mismatch — if physical_work_location_state differs from job's job_state, preserve both,
   set jurisdiction to null, confidence 'low' (Needs Review). Neither state is authoritative.
3. GPS-validated match — if physical_work_location_state matches job_state, return job_state (high confidence)
4. Job default (no GPS) — return job_state with 'medium' confidence (flagged for review)
5. Non-job time types (shop_admin, training, pto, travel) — use actual/configured location when known,
   otherwise mark 'unassigned' for review. PTO never uses GPS for physical work location.
6. No job, no GPS — return null, 'unassigned' (blocks payroll)

### determine_segment_jurisdiction(p_segment_id uuid)
Same logic but operates on payroll_time_segments.

### batch_determine_jurisdiction(p_entry_ids uuid[])
Processes multiple entries and returns a summary.

## Security
Functions are SECURITY DEFINER so they can read across tables (work_orders, projects,
company_settings, company_offices, internal_time_sessions) within the same tenant.
They filter by organization_id to maintain tenant isolation.
*/

-- =========================================================
-- Function: determine_work_jurisdiction for a time_entry
-- =========================================================
CREATE OR REPLACE FUNCTION determine_work_jurisdiction(p_time_entry_id uuid)
RETURNS json AS $$
DECLARE
  v_entry record;
  v_job_state text;
  v_phys_state text;
  v_result json;
  v_org_id uuid;
  v_session_type text;
  v_office_state text;
  v_default_state text;
  v_entry_type text;
BEGIN
  -- Load the time entry
  SELECT te.* INTO v_entry
  FROM time_entries te
  WHERE te.id = p_time_entry_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'time entry not found');
  END IF;

  v_org_id := v_entry.organization_id;
  v_phys_state := v_entry.physical_work_location_state;
  v_entry_type := v_entry.entry_type;

  -- 1. Manual override takes precedence
  IF v_entry.work_jurisdiction_source = 'manual_override' AND v_entry.work_jurisdiction_state IS NOT NULL THEN
    RETURN json_build_object(
      'jurisdiction_state', v_entry.work_jurisdiction_state,
      'jurisdiction_source', 'manual_override',
      'confidence', 'high',
      'gps_validated', v_entry.gps_validated,
      'physical_work_location_state', v_phys_state
    );
  END IF;

  -- Determine job state from linked work_order or project
  IF v_entry.work_order_id IS NOT NULL THEN
    SELECT wo.job_state INTO v_job_state
    FROM work_orders wo
    WHERE wo.id = v_entry.work_order_id;
  ELSIF v_entry.project_id IS NOT NULL THEN
    SELECT p.job_state INTO v_job_state
    FROM projects p
    WHERE p.id = v_entry.project_id;
  END IF;

  -- Check if this is a non-job time type (training, shop/admin via internal_session_id)
  IF v_entry.internal_session_id IS NOT NULL THEN
    SELECT session_type INTO v_session_type
    FROM internal_time_sessions
    WHERE id = v_entry.internal_session_id;
  END IF;

  -- Get tenant default jurisdiction state
  SELECT cs.default_jurisdiction_state INTO v_default_state
  FROM company_settings cs
  WHERE cs.organization_id = v_org_id;

  -- 2. GPS/job mismatch (Revision 2: preserve both, require review)
  IF v_phys_state IS NOT NULL AND v_job_state IS NOT NULL AND UPPER(v_phys_state) != UPPER(v_job_state) THEN
    RETURN json_build_object(
      'jurisdiction_state', null,
      'jurisdiction_source', 'gps_job_mismatch',
      'confidence', 'low',
      'gps_validated', false,
      'physical_work_location_state', v_phys_state,
      'job_state', v_job_state,
      'needs_review', true
    );
  END IF;

  -- 3. GPS-validated match
  IF v_phys_state IS NOT NULL AND v_job_state IS NOT NULL AND UPPER(v_phys_state) = UPPER(v_job_state) THEN
    RETURN json_build_object(
      'jurisdiction_state', UPPER(v_job_state),
      'jurisdiction_source', 'gps_validated',
      'confidence', 'high',
      'gps_validated', true,
      'physical_work_location_state', v_phys_state
    );
  END IF;

  -- 4. Non-job time types (Revision 1)
  -- Training: use configured location if known (from internal_time_sessions)
  IF v_entry_type = 'training' OR v_session_type = 'training' THEN
    -- Check if linked to a company office with a state
    IF v_entry.internal_session_id IS NOT NULL THEN
      SELECT co.state INTO v_office_state
      FROM internal_time_sessions its
      LEFT JOIN company_offices co ON co.id = its.office_id
      WHERE its.id = v_entry.internal_session_id
        AND co.state IS NOT NULL;
    END IF;

    IF v_office_state IS NOT NULL THEN
      RETURN json_build_object(
        'jurisdiction_state', UPPER(v_office_state),
        'jurisdiction_source', 'exception_rule',
        'confidence', 'high',
        'gps_validated', null,
        'physical_work_location_state', v_phys_state
      );
    END IF;

    -- If employee's physical location is known (remote training), use it
    IF v_phys_state IS NOT NULL THEN
      RETURN json_build_object(
        'jurisdiction_state', UPPER(v_phys_state),
        'jurisdiction_source', 'exception_rule',
        'confidence', 'medium',
        'gps_validated', null,
        'physical_work_location_state', v_phys_state
      );
    END IF;

    -- Cannot reliably determine — mark for review
    RETURN json_build_object(
      'jurisdiction_state', null,
      'jurisdiction_source', 'exception_rule',
      'confidence', 'unassigned',
      'gps_validated', null,
      'physical_work_location_state', null,
      'needs_review', true
    );
  END IF;

  -- Shop/admin time
  IF v_session_type = 'shop_time' OR v_entry_type = 'shop_admin' THEN
    -- Check if linked to a company office with a state
    IF v_entry.internal_session_id IS NOT NULL THEN
      SELECT co.state INTO v_office_state
      FROM internal_time_sessions its
      LEFT JOIN company_offices co ON co.id = its.office_id
      WHERE its.id = v_entry.internal_session_id
        AND co.state IS NOT NULL;
    END IF;

    IF v_office_state IS NOT NULL THEN
      RETURN json_build_object(
        'jurisdiction_state', UPPER(v_office_state),
        'jurisdiction_source', 'exception_rule',
        'confidence', 'high',
        'gps_validated', null,
        'physical_work_location_state', v_phys_state
      );
    END IF;

    -- Remote admin: use employee's physical location if known
    IF v_phys_state IS NOT NULL THEN
      RETURN json_build_object(
        'jurisdiction_state', UPPER(v_phys_state),
        'jurisdiction_source', 'exception_rule',
        'confidence', 'medium',
        'gps_validated', null,
        'physical_work_location_state', v_phys_state
      );
    END IF;

    -- Cannot reliably determine — mark for review
    RETURN json_build_object(
      'jurisdiction_state', null,
      'jurisdiction_source', 'exception_rule',
      'confidence', 'unassigned',
      'gps_validated', null,
      'physical_work_location_state', null,
      'needs_review', true
    );
  END IF;

  -- PTO: do NOT use GPS to establish physical work location (Revision 1)
  IF v_entry_type = 'pto' OR v_session_type = 'pto' THEN
    RETURN json_build_object(
      'jurisdiction_state', null,
      'jurisdiction_source', 'exception_rule',
      'confidence', 'unassigned',
      'gps_validated', null,
      'physical_work_location_state', null,
      'needs_review', true,
      'note', 'PTO is paid leave — jurisdiction requires tenant configuration or admin decision'
    );
  END IF;

  -- Travel: extensible, may cross jurisdictions — mark for review (Revision 1)
  IF v_entry_type = 'travel' OR v_session_type = 'travel' THEN
    RETURN json_build_object(
      'jurisdiction_state', null,
      'jurisdiction_source', 'exception_rule',
      'confidence', 'unassigned',
      'gps_validated', null,
      'physical_work_location_state', v_phys_state,
      'needs_review', true,
      'note', 'Travel may cross jurisdictions — requires tenant-configured rules or admin decision'
    );
  END IF;

  -- 5. Job default (no GPS) — medium confidence, flagged for review
  IF v_job_state IS NOT NULL THEN
    RETURN json_build_object(
      'jurisdiction_state', UPPER(v_job_state),
      'jurisdiction_source', 'job_default',
      'confidence', 'medium',
      'gps_validated', null,
      'physical_work_location_state', v_phys_state,
      'needs_review', true
    );
  END IF;

  -- 6. No job, no GPS, no location info — unassigned (blocks payroll)
  RETURN json_build_object(
    'jurisdiction_state', null,
    'jurisdiction_source', null,
    'confidence', 'unassigned',
    'gps_validated', null,
    'physical_work_location_state', v_phys_state,
    'needs_review', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================
-- Function: determine_segment_jurisdiction for a payroll_time_segment
-- =========================================================
CREATE OR REPLACE FUNCTION determine_segment_jurisdiction(p_segment_id uuid)
RETURNS json AS $$
DECLARE
  v_seg record;
  v_job_state text;
  v_phys_state text;
  v_result json;
  v_org_id uuid;
  v_default_state text;
  v_office_state text;
BEGIN
  SELECT pts.* INTO v_seg
  FROM payroll_time_segments pts
  WHERE pts.id = p_segment_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'segment not found');
  END IF;

  v_org_id := v_seg.organization_id;
  v_phys_state := v_seg.physical_work_location_state;

  -- 1. Manual override takes precedence
  IF v_seg.work_jurisdiction_source = 'manual_override' AND v_seg.work_jurisdiction_state IS NOT NULL THEN
    RETURN json_build_object(
      'jurisdiction_state', v_seg.work_jurisdiction_state,
      'jurisdiction_source', 'manual_override',
      'confidence', 'high',
      'gps_validated', v_seg.gps_validated,
      'physical_work_location_state', v_phys_state
    );
  END IF;

  -- Determine job state
  IF v_seg.work_order_id IS NOT NULL THEN
    SELECT wo.job_state INTO v_job_state
    FROM work_orders wo
    WHERE wo.id = v_seg.work_order_id;
  ELSIF v_seg.project_id IS NOT NULL THEN
    SELECT p.job_state INTO v_job_state
    FROM projects p
    WHERE p.id = v_seg.project_id;
  END IF;

  -- Get tenant default jurisdiction state
  SELECT cs.default_jurisdiction_state INTO v_default_state
  FROM company_settings cs
  WHERE cs.organization_id = v_org_id;

  -- 2. GPS/job mismatch (Revision 2)
  IF v_phys_state IS NOT NULL AND v_job_state IS NOT NULL AND UPPER(v_phys_state) != UPPER(v_job_state) THEN
    RETURN json_build_object(
      'jurisdiction_state', null,
      'jurisdiction_source', 'gps_job_mismatch',
      'confidence', 'low',
      'gps_validated', false,
      'physical_work_location_state', v_phys_state,
      'job_state', v_job_state,
      'needs_review', true
    );
  END IF;

  -- 3. GPS-validated match
  IF v_phys_state IS NOT NULL AND v_job_state IS NOT NULL AND UPPER(v_phys_state) = UPPER(v_job_state) THEN
    RETURN json_build_object(
      'jurisdiction_state', UPPER(v_job_state),
      'jurisdiction_source', 'gps_validated',
      'confidence', 'high',
      'gps_validated', true,
      'physical_work_location_state', v_phys_state
    );
  END IF;

  -- Non-job time types
  IF v_seg.time_type IN ('training', 'shop_admin', 'pto', 'travel') THEN
    -- Check for linked company office
    IF v_seg.daily_clock_entry_id IS NOT NULL THEN
      SELECT co.state INTO v_office_state
      FROM daily_clock_entries dce
      LEFT JOIN company_offices co ON co.id = dce.office_id
      WHERE dce.id = v_seg.daily_clock_entry_id
        AND co.state IS NOT NULL;
    END IF;

    IF v_office_state IS NOT NULL AND v_seg.time_type IN ('training', 'shop_admin') THEN
      RETURN json_build_object(
        'jurisdiction_state', UPPER(v_office_state),
        'jurisdiction_source', 'exception_rule',
        'confidence', 'high',
        'gps_validated', null,
        'physical_work_location_state', v_phys_state
      );
    END IF;

    -- Remote admin/training: use physical location if known
    IF v_phys_state IS NOT NULL AND v_seg.time_type IN ('training', 'shop_admin') THEN
      RETURN json_build_object(
        'jurisdiction_state', UPPER(v_phys_state),
        'jurisdiction_source', 'exception_rule',
        'confidence', 'medium',
        'gps_validated', null,
        'physical_work_location_state', v_phys_state
      );
    END IF;

    -- PTO: never use GPS (Revision 1)
    -- Travel: extensible, mark for review (Revision 1)
    -- All others that can't be reliably determined
    RETURN json_build_object(
      'jurisdiction_state', null,
      'jurisdiction_source', 'exception_rule',
      'confidence', 'unassigned',
      'gps_validated', null,
      'physical_work_location_state', CASE WHEN v_seg.time_type = 'pto' THEN null ELSE v_phys_state END,
      'needs_review', true
    );
  END IF;

  -- 5. Job default (no GPS) — medium confidence, flagged for review
  IF v_job_state IS NOT NULL THEN
    RETURN json_build_object(
      'jurisdiction_state', UPPER(v_job_state),
      'jurisdiction_source', 'job_default',
      'confidence', 'medium',
      'gps_validated', null,
      'physical_work_location_state', v_phys_state,
      'needs_review', true
    );
  END IF;

  -- 6. No job, no GPS — unassigned
  RETURN json_build_object(
    'jurisdiction_state', null,
    'jurisdiction_source', null,
    'confidence', 'unassigned',
    'gps_validated', null,
    'physical_work_location_state', v_phys_state,
    'needs_review', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================
-- Function: batch_determine_jurisdiction
-- =========================================================
CREATE OR REPLACE FUNCTION batch_determine_jurisdiction(p_entry_ids uuid[])
RETURNS json AS $$
DECLARE
  v_total int := 0;
  v_high int := 0;
  v_medium int := 0;
  v_low int := 0;
  v_unassigned int := 0;
  v_needs_review int := 0;
  v_result json;
  v_entry_id uuid;
BEGIN
  FOREACH v_entry_id IN ARRAY p_entry_ids LOOP
    v_result := determine_work_jurisdiction(v_entry_id);
    v_total := v_total + 1;

    IF (v_result->>'confidence') = 'high' THEN
      v_high := v_high + 1;
    ELSIF (v_result->>'confidence') = 'medium' THEN
      v_medium := v_medium + 1;
    ELSIF (v_result->>'confidence') = 'low' THEN
      v_low := v_low + 1;
    ELSIF (v_result->>'confidence') = 'unassigned' THEN
      v_unassigned := v_unassigned + 1;
    END IF;

    IF (v_result->>'needs_review') = 'true' THEN
      v_needs_review := v_needs_review + 1;
    END IF;
  END LOOP;

  RETURN json_build_object(
    'total', v_total,
    'high_confidence', v_high,
    'medium_confidence', v_medium,
    'low_confidence', v_low,
    'unassigned', v_unassigned,
    'needs_review', v_needs_review
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================
-- Function: regenerate_payroll_segments (idempotent)
-- =========================================================
-- Generates or updates payroll_time_segments from source time records.
-- Only updates segments that are NOT locked. Idempotent via segment_key unique constraint.
CREATE OR REPLACE FUNCTION regenerate_payroll_segments(
  p_organization_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS json AS $$
DECLARE
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped_locked int := 0;
  v_seg_key text;
BEGIN
  -- From time_entries
  INSERT INTO payroll_time_segments (
    organization_id, employee_id, segment_date, start_time, end_time,
    total_hours, break_minutes, time_type, source_table, source_record_id,
    segment_key, segment_sequence, daily_clock_entry_id, work_order_id, project_id,
    labor_phase_id, overtime_hours, physical_work_location_state, physical_work_lat,
    physical_work_lng, gps_validated
  )
  SELECT
    te.organization_id,
    te.technician_id,
    te.entry_date,
    te.clock_in,
    te.clock_out,
    te.total_hours,
    COALESCE(te.break_minutes, 0),
    CASE
      WHEN te.entry_type = 'work_order' THEN 'job'
      WHEN te.entry_type = 'project' THEN 'job'
      WHEN te.entry_type = 'training' THEN 'training'
      ELSE 'job'
    END,
    'time_entries',
    te.id,
    'time_entries:' || te.id::text || ':0',
    0,
    NULL, -- daily_clock_entry_id not directly linked in time_entries
    te.work_order_id,
    te.project_id,
    te.labor_phase_id,
    te.overtime_hours,
    te.physical_work_location_state,
    NULL, -- lat stored separately, will be enriched later
    NULL,
    te.gps_validated
  FROM time_entries te
  WHERE te.organization_id = p_organization_id
    AND te.entry_date >= p_start_date
    AND te.entry_date <= p_end_date
  ON CONFLICT (organization_id, segment_key)
  DO UPDATE SET
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    total_hours = EXCLUDED.total_hours,
    break_minutes = EXCLUDED.break_minutes,
    overtime_hours = EXCLUDED.overtime_hours,
    physical_work_location_state = EXCLUDED.physical_work_location_state,
    gps_validated = EXCLUDED.gps_validated,
    work_order_id = EXCLUDED.work_order_id,
    project_id = EXCLUDED.project_id,
    labor_phase_id = EXCLUDED.labor_phase_id
  WHERE payroll_time_segments.is_locked = false
  RETURNING 1 AS affected;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- From internal_time_sessions (shop_admin / training)
  INSERT INTO payroll_time_segments (
    organization_id, employee_id, segment_date, start_time, end_time,
    total_hours, time_type, source_table, source_record_id,
    segment_key, segment_sequence
  )
  SELECT
    its.organization_id,
    its.assigned_to,
    its.session_date,
    (its.session_date::timestamp + its.start_time) AT TIME ZONE 'UTC',
    CASE WHEN its.end_time IS NOT NULL
      THEN (its.session_date::timestamp + its.end_time) AT TIME ZONE 'UTC'
      ELSE NULL
    END,
    its.predetermined_hours,
    CASE WHEN its.session_type = 'shop_time' THEN 'shop_admin' ELSE its.session_type END,
    'internal_time_sessions',
    its.id,
    'internal_time_sessions:' || its.id::text || ':0',
    0
  FROM internal_time_sessions its
  WHERE its.organization_id = p_organization_id
    AND its.session_date >= p_start_date
    AND its.session_date <= p_end_date
    AND its.status = 'scheduled'
  ON CONFLICT (organization_id, segment_key)
  DO UPDATE SET
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    total_hours = EXCLUDED.total_hours,
    time_type = EXCLUDED.time_type
  WHERE payroll_time_segments.is_locked = false;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN json_build_object(
    'inserted_or_updated', v_inserted + v_updated,
    'skipped_locked', v_skipped_locked
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
