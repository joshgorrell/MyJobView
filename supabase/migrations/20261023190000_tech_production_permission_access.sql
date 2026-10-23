-- Tech Stats needs production and availability, not project financials or import controls.
-- Keep the existing administrator boundary for historical imports.
CREATE OR REPLACE FUNCTION public.get_tech_production(p_start date, p_end date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE org uuid; result jsonb;
BEGIN
  SELECT organization_id INTO org FROM public.profiles WHERE id = auth.uid();
  IF auth.uid() IS NULL OR org IS NULL THEN
    RAISE EXCEPTION 'Tech Stats access denied';
  END IF;
  IF NOT COALESCE(public.can_manage_labor(org), false) AND NOT EXISTS (
    SELECT 1
    FROM public.profiles viewer
    JOIN public.department_modules m ON m.module_key = 'tech_stats' AND m.is_active = true
    WHERE viewer.id = auth.uid() AND viewer.organization_id = org
      AND NOT EXISTS (
        SELECT 1 FROM public.user_permission_overrides o
        JOIN public.department_modules sibling ON sibling.id = o.module_id
        WHERE o.user_id = viewer.id AND sibling.module_key = 'tech_stats'
          AND sibling.is_active = true AND o.override_type = 'revoke'
      )
      AND (
        EXISTS (
          SELECT 1 FROM public.user_permission_overrides o
          JOIN public.department_modules sibling ON sibling.id = o.module_id
          WHERE o.user_id = viewer.id AND sibling.module_key = 'tech_stats'
            AND sibling.is_active = true AND o.override_type = 'grant'
        )
        OR EXISTS (
          SELECT 1 FROM public.role_module_access a
          JOIN public.department_modules sibling ON sibling.id = a.module_id
          WHERE a.role_id = viewer.role_id AND sibling.module_key = 'tech_stats'
            AND sibling.is_active = true AND a.has_access = true
        )
      )
  ) THEN
    RAISE EXCEPTION 'Tech Stats access denied';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_start > p_end OR p_end - p_start > 1830 THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;
  SELECT jsonb_build_object(
    'timezone', (SELECT timezone FROM public.organizations WHERE id = org),
    'roster', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'hire_date', e.hire_date))
      FROM public.labor_dashboard_roster r JOIN public.profiles p ON p.id = r.profile_id AND p.organization_id = r.organization_id
      LEFT JOIN public.employees e ON e.user_id = p.id AND e.organization_id = r.organization_id WHERE r.organization_id = org AND r.active), '[]'::jsonb),
    'configs', COALESCE((SELECT jsonb_agg(jsonb_build_object('profile_id', e.user_id, 'compensation_type', c.compensation_type,
      'expected_weekly_hours', c.expected_weekly_hours, 'work_days', c.work_days, 'effective_from', c.effective_from, 'effective_to', c.effective_to))
      FROM public.employee_payroll_configs c JOIN public.employees e ON e.id = c.employee_id AND e.organization_id = c.organization_id
      WHERE c.organization_id = org AND c.effective_from <= p_end AND (c.effective_to IS NULL OR c.effective_to >= p_start)), '[]'::jsonb),
    'mappings', COALESCE((SELECT jsonb_agg(jsonb_build_object('profile_id', profile_id, 'source', source, 'external_employee_id', external_employee_id))
      FROM public.labor_external_employee_mappings WHERE organization_id = org), '[]'::jsonb),
    'sources', COALESCE((SELECT jsonb_agg(jsonb_build_object('source', source, 'native_from', native_from))
      FROM public.labor_import_sources WHERE organization_id = org), '[]'::jsonb),
    'holidays', COALESCE((SELECT to_jsonb(holidays) FROM public.labor_dashboard_calendars WHERE organization_id = org), '[]'::jsonb),
    'snapshots', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', s.kind, 'day', s.day, 'payload', jsonb_build_object('records',
      COALESCE((SELECT jsonb_agg(CASE WHEN s.kind = 'technician' THEN jsonb_build_object(
        'technician', r->'technician', 'job_hours', r->'job_hours', 'review_flags', COALESCE(r->'review_flags', '[]'::jsonb),
        'first_job_in', r->'first_job_in', 'last_job_out', r->'last_job_out', 'job_timing_complete', r->'job_timing_complete')
        ELSE jsonb_build_object('user_id', r->'user_id', 'worked_hours', r->'worked_hours', 'leave_hours', r->'leave_hours',
          'unknown_hours', r->'unknown_hours', 'flags', COALESCE(r->'flags', '[]'::jsonb)) END)
        FROM jsonb_array_elements(s.payload->'records') r), '[]'::jsonb))))
      FROM public.external_labor_snapshots s WHERE s.organization_id = org AND s.kind IN ('technician', 'payroll') AND s.day BETWEEN p_start AND p_end), '[]'::jsonb),
    'latest_job_day', (SELECT max(day) FROM public.external_labor_snapshots WHERE organization_id = org AND kind = 'technician'),
    'latest_payroll_day', (SELECT max(day) FROM public.external_labor_snapshots WHERE organization_id = org AND kind = 'payroll'),
    'native_jobs', COALESCE((SELECT jsonb_agg(to_jsonb(j)) FROM (
      SELECT technician_id AS profile_id, entry_date AS day, sum(total_hours) AS hours FROM public.time_entries
      WHERE organization_id = org AND entry_date BETWEEN p_start AND p_end AND status = 'approved' AND clock_out IS NOT NULL
        AND COALESCE(entry_type, 'work_order') IN ('work_order', 'project', 'customer_activity') GROUP BY technician_id, entry_date) j), '[]'::jsonb),
    'native_payroll', COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM (
      SELECT technician_id AS profile_id, entry_date AS day, sum(CASE WHEN leave_type IS NULL THEN total_hours ELSE 0 END) AS hours,
        sum(CASE WHEN leave_type IS NOT NULL THEN total_hours ELSE 0 END) AS leave_hours,
        bool_or(status NOT IN ('clocked_out', 'approved') OR total_hours IS NULL OR total_hours < 0) AS needs_review
      FROM public.daily_clock_entries WHERE organization_id = org AND entry_date BETWEEN p_start AND p_end GROUP BY technician_id, entry_date) c), '[]'::jsonb),
    'project_snapshot', NULL, 'native_projects', '[]'::jsonb
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_tech_production(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tech_production(date, date) TO authenticated;
COMMENT ON FUNCTION public.get_tech_production(date, date) IS 'Read-only production and utilization feed; effective Tech Stats permission historical access; no project calculations, pay rates, payments or source settings.';
