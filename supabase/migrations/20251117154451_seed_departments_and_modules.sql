/*
  # Seed Departments and Modules

  ## Overview
  Populates the 5 core departments and their modules based on the Electronic Life specification.

  ## Departments Created
  1. Pipeline - Sales & Lead Management
  2. Production - Project Execution
  3. Dispatch - Field Operations & Scheduling
  4. Finance - Billing, Payroll, Accounting
  5. Admin - System Configuration

  ## Default Access
  - Admins: Full access to all departments
  - Sales/BD: Pipeline, limited Production/Finance view
  - Project Managers: Production, Dispatch, limited Finance
  - Technicians: Production (work center view), Dispatch
  - Office Managers: All departments except field operations
  - Portal Users: Limited Production view (MyJobView)
*/

-- Insert the 5 departments
INSERT INTO departments (name, display_name, description, icon, color, sort_order) VALUES
  ('pipeline', 'Pipeline', 'Sales activity from first contact through approved proposals', 'TrendingUp', 'green', 1),
  ('production', 'Production', 'Job execution and project management after sale completion', 'Wrench', 'blue', 2),
  ('dispatch', 'Dispatch', 'Real-time operational command center for field management', 'MapPin', 'orange', 3),
  ('finance', 'Finance', 'Financial operations, invoicing, payments, and payroll', 'DollarSign', 'purple', 4),
  ('admin', 'Admin', 'System-wide settings, users, permissions, and integrations', 'Settings', 'red', 5)
ON CONFLICT (name) DO NOTHING;

-- Get department IDs for module insertion
DO $$
DECLARE
  pipeline_id uuid;
  production_id uuid;
  dispatch_id uuid;
  finance_id uuid;
  admin_id uuid;
BEGIN
  SELECT id INTO pipeline_id FROM departments WHERE name = 'pipeline';
  SELECT id INTO production_id FROM departments WHERE name = 'production';
  SELECT id INTO dispatch_id FROM departments WHERE name = 'dispatch';
  SELECT id INTO finance_id FROM departments WHERE name = 'finance';
  SELECT id INTO admin_id FROM departments WHERE name = 'admin';

  -- PIPELINE MODULES
  INSERT INTO department_modules (department_id, module_key, display_name, description, icon, sort_order) VALUES
    (pipeline_id, 'pipeline_dashboard', 'Sales Dashboard', 'Unified sales metrics and performance overview', 'LayoutDashboard', 1),
    (pipeline_id, 'leads', 'Leads', 'Manage leads and opportunities', 'Users', 2),
    (pipeline_id, 'fishbowl', 'Fishbowl', 'Unclaimed leads pool', 'Fish', 3),
    (pipeline_id, 'contacts', 'Contacts', 'Customer and prospect contact management', 'UserCircle', 4),
    (pipeline_id, 'connections', 'Connections', 'Relationship tracking and follow-ups', 'Network', 5),
    (pipeline_id, 'proposals', 'Proposals', 'Create and manage sales proposals', 'FileText', 6),
    (pipeline_id, 'recur', 'Recurring Revenue', 'RMR and subscription management', 'RefreshCw', 7),
    (pipeline_id, 'sales_orders', 'Sales Orders', 'View approved sales orders', 'ShoppingCart', 8)
  ON CONFLICT (department_id, module_key) DO NOTHING;

  -- PRODUCTION MODULES
  INSERT INTO department_modules (department_id, module_key, display_name, description, icon, sort_order) VALUES
    (production_id, 'projects', 'Projects', 'Active project list and management', 'Briefcase', 1),
    (production_id, 'work_orders', 'Work Orders', 'Task assignments and tracking', 'ClipboardList', 2),
    (production_id, 'change_orders', 'Change Orders', 'Scope changes and modifications', 'Edit3', 3),
    (production_id, 'materials', 'Materials', 'Parts and materials tracking', 'Package', 4),
    (production_id, 'job_files', 'Job Files', 'Documents and diagrams', 'FolderOpen', 5),
    (production_id, 'punch_list', 'Punch List', 'Job completion checklist', 'CheckSquare', 6),
    (production_id, 'tech_center', 'Tech Work Center', 'Technician daily task view', 'Hammer', 7),
    (production_id, 'vip_program', 'VIP 90-Day', 'Test & tune follow-up program', 'Award', 8)
  ON CONFLICT (department_id, module_key) DO NOTHING;

  -- DISPATCH MODULES
  INSERT INTO department_modules (department_id, module_key, display_name, description, icon, sort_order) VALUES
    (dispatch_id, 'schedule_board', 'Schedule Board', 'Drag-and-drop technician scheduling', 'Calendar', 1),
    (dispatch_id, 'tech_map', 'Technician Map', 'Real-time GPS location tracking', 'Map', 2),
    (dispatch_id, 'appointments', 'Appointments', 'Appointment calendar and management', 'Clock', 3),
    (dispatch_id, 'unassigned_jobs', 'Unassigned Jobs', 'Jobs pending assignment', 'AlertCircle', 4),
    (dispatch_id, 'tech_status', 'Tech Status', 'Technician availability dashboard', 'Activity', 5),
    (dispatch_id, 'travel_bonus', 'Travel Bonus', 'Distance-based bonus tracking', 'Navigation', 6),
    (dispatch_id, 'crew_tools', 'Crew Assignment', 'Team composition and scheduling', 'Users', 7)
  ON CONFLICT (department_id, module_key) DO NOTHING;

  -- FINANCE MODULES
  INSERT INTO department_modules (department_id, module_key, display_name, description, icon, sort_order) VALUES
    (finance_id, 'invoices', 'Invoices', 'Invoice creation and management', 'FileText', 1),
    (finance_id, 'payments', 'Payments', 'Payment recording and history', 'CreditCard', 2),
    (finance_id, 'payroll', 'Payroll', 'Employee compensation processing', 'Wallet', 3),
    (finance_id, 'time_approval', 'Time Approval', 'Approve technician hours', 'Clock', 4),
    (finance_id, 'travel_approval', 'Travel Approval', 'Approve distance bonuses', 'Navigation', 5),
    (finance_id, 'commissions', 'Commissions', 'Sales commission tracking', 'TrendingUp', 6),
    (finance_id, 'job_costing', 'Job Costing', 'Project profitability analysis', 'Calculator', 7),
    (finance_id, 'reports', 'Financial Reports', 'P&L and financial analytics', 'BarChart3', 8),
    (finance_id, 'quickbooks', 'QuickBooks', 'QBO integration settings', 'Link', 9)
  ON CONFLICT (department_id, module_key) DO NOTHING;

  -- ADMIN MODULES
  INSERT INTO department_modules (department_id, module_key, display_name, description, icon, sort_order) VALUES
    (admin_id, 'users', 'User Management', 'Add, edit, and manage users', 'Users', 1),
    (admin_id, 'permissions', 'Permissions', 'Role and access control', 'Shield', 2),
    (admin_id, 'department_access', 'Department Access', 'Control department visibility', 'Lock', 3),
    (admin_id, 'company_settings', 'Company Settings', 'Business information and branding', 'Building', 4),
    (admin_id, 'offices', 'Offices', 'Sales office and territory setup', 'MapPin', 5),
    (admin_id, 'pay_types', 'Pay Types', 'Technician compensation configuration', 'DollarSign', 6),
    (admin_id, 'travel_settings', 'Travel Bonus', 'Bubble radii and rate settings', 'Navigation', 7),
    (admin_id, 'products', 'Product Catalog', 'Products and pricing', 'Package', 8),
    (admin_id, 'rewards', 'Rewards System', 'Points and rewards configuration', 'Award', 9),
    (admin_id, 'email_templates', 'Email Templates', 'Email automation templates', 'Mail', 10),
    (admin_id, 'integrations', 'Integrations', 'Third-party connections', 'Plug', 11)
  ON CONFLICT (department_id, module_key) DO NOTHING;

END $$;

-- Set default role access for Pipeline
INSERT INTO department_role_access (department_id, role, has_access, can_manage)
SELECT d.id, r.role, true, (r.role = 'admin')
FROM departments d
CROSS JOIN (
  SELECT 'admin' as role UNION ALL
  SELECT 'sales' UNION ALL
  SELECT 'bd' UNION ALL
  SELECT 'office_manager'
) r
WHERE d.name = 'pipeline'
ON CONFLICT (department_id, role) DO NOTHING;

-- Set default role access for Production
INSERT INTO department_role_access (department_id, role, has_access, can_manage)
SELECT d.id, r.role, true, (r.role = 'admin')
FROM departments d
CROSS JOIN (
  SELECT 'admin' as role UNION ALL
  SELECT 'project_manager' UNION ALL
  SELECT 'technician' UNION ALL
  SELECT 'office_manager' UNION ALL
  SELECT 'sales' UNION ALL
  SELECT 'portal_user'
) r
WHERE d.name = 'production'
ON CONFLICT (department_id, role) DO NOTHING;

-- Set default role access for Dispatch
INSERT INTO department_role_access (department_id, role, has_access, can_manage)
SELECT d.id, r.role, true, (r.role = 'admin')
FROM departments d
CROSS JOIN (
  SELECT 'admin' as role UNION ALL
  SELECT 'office_manager' UNION ALL
  SELECT 'project_manager' UNION ALL
  SELECT 'technician'
) r
WHERE d.name = 'dispatch'
ON CONFLICT (department_id, role) DO NOTHING;

-- Set default role access for Finance
INSERT INTO department_role_access (department_id, role, has_access, can_manage)
SELECT d.id, r.role, true, (r.role = 'admin')
FROM departments d
CROSS JOIN (
  SELECT 'admin' as role UNION ALL
  SELECT 'office_manager'
) r
WHERE d.name = 'finance'
ON CONFLICT (department_id, role) DO NOTHING;

-- Set default role access for Admin
INSERT INTO department_role_access (department_id, role, has_access, can_manage)
SELECT d.id, 'admin', true, true
FROM departments d
WHERE d.name = 'admin'
ON CONFLICT (department_id, role) DO NOTHING;
