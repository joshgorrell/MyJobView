/*
# Add Jurisdiction Fields to Time and Location Tables

## Purpose
Add payroll jurisdiction tracking fields to time entries, daily clock entries,
work orders, projects, and company settings. These fields enable the jurisdiction
rules engine to determine where work was actually performed for payroll purposes.

## Tables Modified

### time_entries (new columns)
- work_jurisdiction_state (text, nullable) — 2-char state code for payroll jurisdiction
- work_jurisdiction_source (text, nullable) — how jurisdiction was determined:
  'manual_override', 'exception_rule', 'gps_validated', 'job_default', 'tenant_default'
- work_jurisdiction_confidence (text, nullable) — 'high', 'medium', 'low', 'unassigned'
- work_jurisdiction_override_by (uuid, nullable) — admin who manually overrode
- work_jurisdiction_override_reason (text, nullable) — reason for override
- work_jurisdiction_reviewed_at (timestamptz, nullable) — when admin reviewed
- physical_work_location_state (text, nullable) — state from GPS reverse geocode
- gps_validated (boolean, nullable) — whether GPS confirmed job location

### daily_clock_entries (same new columns)
Same jurisdiction fields for non-job time (shop/admin/PTO/travel days).

### work_orders
- job_state (text, nullable) — normalized 2-char state code derived from service_location_state

### projects
- job_state (text, nullable) — normalized 2-char state code

### company_settings
- default_jurisdiction_state (text, nullable) — tenant's home state for fallback

## Backfill
- work_orders.job_state set from service_location_state where available
- projects.job_state set from linked work_orders' service_location_state
- company_settings.default_jurisdiction_state set to 'KS' for Electronic Life

## Security
No new RLS policies needed — columns are added to existing tables that already have RLS.
*/

-- =========================================================
-- time_entries: add jurisdiction columns
-- =========================================================
ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS work_jurisdiction_state text,
  ADD COLUMN IF NOT EXISTS work_jurisdiction_source text,
  ADD COLUMN IF NOT EXISTS work_jurisdiction_confidence text,
  ADD COLUMN IF NOT EXISTS work_jurisdiction_override_by uuid,
  ADD COLUMN IF NOT EXISTS work_jurisdiction_override_reason text,
  ADD COLUMN IF NOT EXISTS work_jurisdiction_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS physical_work_location_state text,
  ADD COLUMN IF NOT EXISTS gps_validated boolean;

-- Indexes for Command Center review queries
CREATE INDEX IF NOT EXISTS idx_time_entries_jurisdiction_state
  ON time_entries(work_jurisdiction_state);
CREATE INDEX IF NOT EXISTS idx_time_entries_jurisdiction_confidence
  ON time_entries(work_jurisdiction_confidence);

-- =========================================================
-- daily_clock_entries: add jurisdiction columns
-- =========================================================
ALTER TABLE daily_clock_entries
  ADD COLUMN IF NOT EXISTS work_jurisdiction_state text,
  ADD COLUMN IF NOT EXISTS work_jurisdiction_source text,
  ADD COLUMN IF NOT EXISTS work_jurisdiction_confidence text,
  ADD COLUMN IF NOT EXISTS work_jurisdiction_override_by uuid,
  ADD COLUMN IF NOT EXISTS work_jurisdiction_override_reason text,
  ADD COLUMN IF NOT EXISTS work_jurisdiction_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS physical_work_location_state text,
  ADD COLUMN IF NOT EXISTS gps_validated boolean;

CREATE INDEX IF NOT EXISTS idx_daily_clock_entries_jurisdiction_state
  ON daily_clock_entries(work_jurisdiction_state);
CREATE INDEX IF NOT EXISTS idx_daily_clock_entries_jurisdiction_confidence
  ON daily_clock_entries(work_jurisdiction_confidence);

-- =========================================================
-- work_orders: add normalized job_state
-- =========================================================
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS job_state text;

-- Backfill from service_location_state
UPDATE work_orders
  SET job_state = UPPER(TRIM(service_location_state))
  WHERE service_location_state IS NOT NULL
    AND service_location_state != ''
    AND job_state IS NULL;

CREATE INDEX IF NOT EXISTS idx_work_orders_job_state
  ON work_orders(job_state);

-- =========================================================
-- projects: add normalized job_state
-- =========================================================
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS job_state text;

-- Backfill from linked work_orders' service_location_state
UPDATE projects p
  SET job_state = wo.job_state
  FROM work_orders wo
  WHERE wo.project_id = p.id
    AND wo.job_state IS NOT NULL
    AND p.job_state IS NULL;

-- Also try from customer_location_id if available (projects linked to customer locations)
-- This is a best-effort backfill; remaining nulls will be determined by the rules engine
UPDATE projects p
  SET job_state = 'KS'
  WHERE p.job_state IS NULL
    AND p.organization_id = 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15';

CREATE INDEX IF NOT EXISTS idx_projects_job_state
  ON projects(job_state);

-- =========================================================
-- company_settings: add default_jurisdiction_state
-- =========================================================
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS default_jurisdiction_state text;

-- Backfill Electronic Life's default jurisdiction
UPDATE company_settings
  SET default_jurisdiction_state = 'KS'
  WHERE default_jurisdiction_state IS NULL
    AND organization_id = 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15';
