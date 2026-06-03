/*
  # Add Sales Tax Reports Module to Finance Department

  1. Changes
    - Adds Sales Tax Reports module to Finance department
    - Sets appropriate role access for financial reporting
    - Provides comprehensive tax reporting capabilities

  2. Module Features
    - Filter by date range
    - Filter by document type (proposals/invoices)
    - Filter by environment (residential/commercial)
    - Filter by project type
    - Export to CSV
    - Summary statistics (total tax, avg rate, etc.)
*/

-- Add Sales Tax Reports module to Finance department
INSERT INTO department_modules (
  department_id,
  module_key,
  display_name,
  description,
  icon,
  sort_order,
  is_active
)
SELECT
  d.id,
  'tax_reports',
  'Sales Tax Reports',
  'Track and analyze sales tax collected by date range, project type, and more',
  'Receipt',
  40,
  true
FROM departments d
WHERE d.name = 'finance'
ON CONFLICT DO NOTHING;

-- Set default role access for Sales Tax Reports
INSERT INTO module_role_access (role, module_id, has_access)
SELECT
  'admin',
  dm.id,
  true
FROM department_modules dm
JOIN departments d ON d.id = dm.department_id
WHERE d.name = 'finance'
  AND dm.module_key = 'tax_reports'
ON CONFLICT (role, module_id) DO UPDATE
SET has_access = true;

INSERT INTO module_role_access (role, module_id, has_access)
SELECT
  'office_manager',
  dm.id,
  true
FROM department_modules dm
JOIN departments d ON d.id = dm.department_id
WHERE d.name = 'finance'
  AND dm.module_key = 'tax_reports'
ON CONFLICT (role, module_id) DO UPDATE
SET has_access = true;

-- Create index on proposals for tax reporting queries
CREATE INDEX IF NOT EXISTS idx_proposals_tax_reporting
ON proposals(created_at, tax_environment, tax_project_type, status)
WHERE tax_amount IS NOT NULL;

-- Add helpful comment
COMMENT ON INDEX idx_proposals_tax_reporting IS 'Optimizes sales tax reporting queries by date, environment, and project type';
