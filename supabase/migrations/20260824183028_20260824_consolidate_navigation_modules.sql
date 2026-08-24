-- Deactivate modules that have been consolidated into tabbed pages.
-- These are now internal tabs within parent pages, not standalone sidebar entries.

-- Dispatch: merged into DispatchConsole
UPDATE department_modules SET is_active = false
WHERE module_key IN ('tech_map', 'tech_status', 'tech_stats', 'job_status', 'job_acceptance', 'tech_skills')
AND is_active = true;

-- Dispatch: merged Service Request Analytics into ServiceRequestConsole
UPDATE department_modules SET is_active = false
WHERE module_key = 'service_request_analytics'
AND is_active = true;

-- Sales: merged into Sales Dashboard tabs
UPDATE department_modules SET is_active = false
WHERE module_key IN ('sales_performance', 'office_sales_breakdown')
AND is_active = true;

-- Sales: TV Dashboard removed from sidebar (accessible via standalone route)
UPDATE department_modules SET is_active = false
WHERE module_key = 'sales_tv_dashboard'
AND is_active = true;

-- Production: TV Dashboard removed from sidebar (accessible via standalone route)
UPDATE department_modules SET is_active = false
WHERE module_key = 'tv_dashboard'
AND is_active = true;

-- Pipeline: merged My Performance + Team Pulse into one page
UPDATE department_modules SET is_active = false
WHERE module_key = 'team_leaderboard'
AND is_active = true;

-- Finance: merged Sales Tax Reports + Tax Filing Guide
UPDATE department_modules SET is_active = false
WHERE module_key = 'tax_filing_guide'
AND is_active = true;

-- Finance: merged Bonus Approvals into Commissions Management
UPDATE department_modules SET is_active = false
WHERE module_key = 'bonus_approvals'
AND is_active = true;

-- Finance: merged Security Onboarding, Maintenance, Equipment Warranty into Contract Management
UPDATE department_modules SET is_active = false
WHERE module_key IN ('security_onboarding', 'maintenance_agreements', 'equipment_warranty')
AND is_active = true;

-- Admin: sub-pages that are already tabs within Settings
UPDATE department_modules SET is_active = false
WHERE module_key IN (
  'email_templates',
  'travel_bonus_settings',
  'test_tune_settings',
  'vehicle-tracking',
  'contract_import',
  'historical_sales_import',
  'daily_sales_report_import',
  'points_rewards',
  'gps_diagnostics',
  'contact_import',
  'time_clock_management',
  'pto_management',
  'bug_management'
)
AND is_active = true;
