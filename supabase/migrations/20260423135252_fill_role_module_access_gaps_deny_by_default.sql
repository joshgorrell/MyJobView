/*
  # Fill Role Module Access Gaps — Deny by Default Preparation

  ## Purpose
  Before flipping DepartmentContext.tsx to deny-by-default, every module-role combination
  that currently has NO row in role_module_access must be given an explicit row.
  Without this, flipping the fallback would silently break access for roles that currently
  rely on the implicit "return true" fallback for modules they legitimately need.

  ## What This Migration Does
  Inserts explicit has_access rows (true or false) for every gap identified in the
  permissions audit, covering all 6 roles:
  - Administrator (5 gaps — all granted)
  - Finance (49 gaps)
  - Manager (14 gaps)
  - Sales Representative (14 gaps)
  - Service Manager (19 gaps)
  - Technician (4 gaps — all denied)

  ## Important Notes
  1. Uses INSERT ... ON CONFLICT DO NOTHING so re-running is safe
  2. Does NOT modify any existing rows — only fills missing ones
  3. After this migration is confirmed, the DepartmentContext fallback can safely
     be changed from return true to return false
*/

DO $$
DECLARE
  v_role_id uuid;
  v_module_id uuid;
  v_org_id uuid;
BEGIN

  -- Get the organization ID from existing rows
  SELECT organization_id INTO v_org_id FROM role_module_access LIMIT 1;

  -- ============================================================
  -- ADMINISTRATOR — 5 gaps, all granted
  -- ============================================================
  SELECT id INTO v_role_id FROM roles WHERE role_key = 'admin';

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'service_request_analytics';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'prospects';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'bug_management';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'sales_billing';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'design_queue';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  -- ============================================================
  -- TECHNICIAN — 4 gaps, all denied
  -- ============================================================
  SELECT id INTO v_role_id FROM roles WHERE role_key = 'tech';

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'service_request_analytics';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'sales_billing';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'design_queue';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'report_templates';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  -- ============================================================
  -- MANAGER — 14 gaps
  -- ============================================================
  SELECT id INTO v_role_id FROM roles WHERE role_key = 'manager';

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'preferences';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'my_time_off';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'service_request_analytics';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'tech_stats';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'bonus_approvals';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'tax_reports';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'prospects';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'bug_management';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'test_tune';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'tv_dashboard';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'sales_billing';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'design_queue';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'report_templates';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'sticky-notes';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  -- ============================================================
  -- SALES REPRESENTATIVE — 14 gaps
  -- ============================================================
  SELECT id INTO v_role_id FROM roles WHERE role_key = 'sales';

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'preferences';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'my_time_off';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'service_request_analytics';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'bonus_approvals';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'contract_management';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'tax_reports';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'prospects';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'bug_management';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'test_tune';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'tv_dashboard';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'sales_billing';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'design_queue';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'report_templates';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'sticky-notes';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  -- ============================================================
  -- SERVICE MANAGER — 19 gaps
  -- ============================================================
  SELECT id INTO v_role_id FROM roles WHERE role_key = 'service_manager';

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'preferences';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'my_time_off';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'service_request_analytics';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'bonus_approvals';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'commissions';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'finance_dashboard';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'reports';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'job_costing';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'payroll';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'quickbooks';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'recur';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'tax_reports';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'prospects';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'bug_management';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'test_tune';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'tv_dashboard';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'sales_billing';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'design_queue';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'report_templates';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  -- ============================================================
  -- FINANCE — 49 gaps
  -- ============================================================
  SELECT id INTO v_role_id FROM roles WHERE role_key = 'finance';

  -- admin gap
  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'preferences';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  -- dispatch — all denied for finance
  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'tech_status';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'calendar';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'dispatch_dashboard';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'my_time_off';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'tech_center';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'service_requests';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'service_request_analytics';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'tech_stats';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'tech_map';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'daily_clock';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'travel_bonus';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'unassigned_jobs';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  -- finance gaps
  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'bonus_approvals';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'contract_management';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'tax_reports';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'security_onboarding';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  -- pipeline gaps for finance
  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'connections';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'feed';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'fishbowl';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'leads';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'individual_dashboard';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'tasks';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, true, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'pipeline_board';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'prospects';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'team_leaderboard';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  -- production gaps for finance
  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'bug_management';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'change_orders';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'job_photos';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'parts_requests';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'products_catalog';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'production_dashboard';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'projects';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'punchlist';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'test_tune';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'tv_dashboard';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'work_orders';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  -- sales gaps for finance
  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'sales_billing';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'design_queue';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'messages';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'sales_performance';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'proposals';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'report_templates';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'reviews';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'sales_dashboard';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'sales_orders';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'sticky-notes';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

END $$;
