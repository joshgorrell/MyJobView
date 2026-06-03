/*
  # Fill Remaining Tech Role Module Access Gaps

  ## Purpose
  The initial gap-fill migration missed 30 tech role entries that were previously
  handled by the admin-department fallback deny or were simply absent.
  Now that we are moving to full deny-by-default, every module needs an explicit row.

  ## Changes
  Inserts explicit has_access = false rows for all remaining tech role gaps:
  - admin: preferences (My Settings) — deny
  - finance: all 16 finance modules — deny
  - pipeline: all pipeline modules not already set — deny
  - production: bug_management, test_tune, tv_dashboard — deny
*/

DO $$
DECLARE
  v_role_id uuid;
  v_module_id uuid;
  v_org_id uuid;
BEGIN
  SELECT id INTO v_role_id FROM roles WHERE role_key = 'tech';
  SELECT organization_id INTO v_org_id FROM role_module_access LIMIT 1;

  -- admin
  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'preferences';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  -- finance (all denied for tech)
  FOREACH v_module_id IN ARRAY (
    SELECT ARRAY(SELECT id FROM department_modules WHERE module_key IN (
      'bonus_approvals','commissions','contract_management','finance_dashboard',
      'reports','invoices','job_costing','payments','payroll','quickbooks',
      'recur','tax_reports','security_onboarding','service_billing','time_approval','vip-plans'
    ))
  ) LOOP
    INSERT INTO role_module_access (role_id, module_id, has_access, organization_id)
    VALUES (v_role_id, v_module_id, false, v_org_id)
    ON CONFLICT (role_id, module_id) DO NOTHING;
  END LOOP;

  -- pipeline (all denied for tech)
  FOREACH v_module_id IN ARRAY (
    SELECT ARRAY(SELECT id FROM department_modules WHERE module_key IN (
      'sales_activity','connections','contacts','feed','fishbowl',
      'leads','individual_dashboard','pipeline_board','prospects','team_leaderboard'
    ))
  ) LOOP
    INSERT INTO role_module_access (role_id, module_id, has_access, organization_id)
    VALUES (v_role_id, v_module_id, false, v_org_id)
    ON CONFLICT (role_id, module_id) DO NOTHING;
  END LOOP;

  -- production remaining (denied for tech)
  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'bug_management';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'test_tune';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

  SELECT id INTO v_module_id FROM department_modules WHERE module_key = 'tv_dashboard';
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES (v_role_id, v_module_id, false, v_org_id) ON CONFLICT (role_id, module_id) DO NOTHING;

END $$;
