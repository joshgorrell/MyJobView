-- Keep project report as-of dates independent from the technician completion window.
-- Native project actuals must not include future-dated approved entries.
CREATE OR REPLACE FUNCTION public.get_labor_dashboard(p_start date,p_end date) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid; result jsonb;
BEGIN
 SELECT organization_id INTO org FROM profiles WHERE id=auth.uid();
 IF NOT public.can_manage_labor(org) THEN RAISE EXCEPTION 'Labor dashboard requires organization admin access'; END IF;
 IF p_start IS NULL OR p_end IS NULL OR p_start>p_end OR p_end-p_start>1830 THEN RAISE EXCEPTION 'Invalid date range'; END IF;
 SELECT jsonb_build_object(
  'sources',COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM labor_import_sources s WHERE s.organization_id=org),'[]'::jsonb),
  'timezone',(SELECT timezone FROM organizations WHERE id=org),
  'roster',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'hire_date',e.hire_date)) FROM labor_dashboard_roster r JOIN profiles p ON p.id=r.profile_id AND p.organization_id=r.organization_id LEFT JOIN employees e ON e.user_id=p.id AND e.organization_id=r.organization_id WHERE r.organization_id=org AND r.active),'[]'::jsonb),
  'configs',COALESCE((SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object('profile_id',e.user_id)) FROM employee_payroll_configs c JOIN employees e ON e.id=c.employee_id AND e.organization_id=c.organization_id WHERE c.organization_id=org AND c.effective_from<=p_end AND(c.effective_to IS NULL OR c.effective_to>=p_start)),'[]'::jsonb),
  'mappings',COALESCE((SELECT jsonb_agg(to_jsonb(m)) FROM labor_external_employee_mappings m WHERE m.organization_id=org),'[]'::jsonb),
  'holidays',COALESCE((SELECT to_jsonb(holidays) FROM labor_dashboard_calendars WHERE organization_id=org),'[]'::jsonb),
  'snapshots',COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM external_labor_snapshots s WHERE s.organization_id=org AND s.kind<>'project' AND s.day BETWEEN p_start AND p_end),'[]'::jsonb),
  'project_snapshot',(SELECT to_jsonb(s) FROM external_labor_snapshots s WHERE s.organization_id=org AND s.kind='project' AND s.day<=p_end ORDER BY s.day DESC LIMIT 1),
  'latest_job_day',(SELECT max(day) FROM external_labor_snapshots WHERE organization_id=org AND kind='technician'),
  'latest_payroll_day',(SELECT max(day) FROM external_labor_snapshots WHERE organization_id=org AND kind='payroll'),
  'native_jobs',COALESCE((SELECT jsonb_agg(to_jsonb(j)) FROM(SELECT technician_id AS profile_id,entry_date AS day,sum(total_hours) AS hours FROM time_entries WHERE organization_id=org AND entry_date BETWEEN p_start AND p_end AND status='approved' AND COALESCE(entry_type,'work_order') IN ('work_order','project') GROUP BY technician_id,entry_date) j),'[]'::jsonb),
  'native_payroll',COALESCE((SELECT jsonb_agg(to_jsonb(j)) FROM(SELECT technician_id AS profile_id,entry_date AS day,sum(CASE WHEN leave_type IS NULL THEN total_hours ELSE 0 END) AS hours,sum(CASE WHEN leave_type IS NOT NULL THEN total_hours ELSE 0 END) AS leave_hours,bool_or(status NOT IN ('clocked_out','approved') OR total_hours IS NULL OR total_hours<0) AS needs_review FROM daily_clock_entries WHERE organization_id=org AND entry_date BETWEEN p_start AND p_end GROUP BY technician_id,entry_date) j),'[]'::jsonb),
  'native_projects',COALESCE((SELECT jsonb_agg(jsonb_build_object('project_id',p.id,'project_name',p.name,'hours_sold',so.total_estimated_labor_hours,'hours_used',(SELECT sum(te.total_hours) FROM time_entries te LEFT JOIN work_orders wo ON wo.id=te.work_order_id AND wo.organization_id=te.organization_id WHERE te.organization_id=org AND COALESCE(te.project_id,wo.project_id)=p.id AND te.status='approved' AND te.entry_date<=least(p_end,(now() AT TIME ZONE COALESCE((SELECT timezone FROM organizations WHERE id=org),'America/Chicago'))::date)),'status',p.status)) FROM projects p LEFT JOIN sales_orders so ON so.id=p.sales_order_id AND so.organization_id=p.organization_id WHERE p.organization_id=org),'[]'::jsonb)
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_labor_dashboard(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_labor_dashboard(date,date) TO authenticated;
