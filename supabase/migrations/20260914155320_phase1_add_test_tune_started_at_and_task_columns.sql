/*
# Phase 1: Add test_tune_started_at to projects + source/visibility/assignment columns to project_tasks

## 1. projects table
- Add `test_tune_started_at` (timestamptz, nullable, default null)
  - Records the exact moment a project enters the Test & Tune period.
  - Currently the system uses `substantial_completion_date` (a date, not a timestamp)
    as a proxy for T&T start. This new column provides a precise timestamp for the
    upcoming explicit T&T activation workflow (Phase 4).
  - No existing behavior changes — the column is added but not populated or
    referenced by any trigger or function in this migration.

## 2. project_tasks table
- Add `source` (text, NOT NULL, default 'proposal', CHECK in proposal/manual/customer)
- Add `visibility` (text, NOT NULL, default 'internal', CHECK in internal/customer_visible)
- Add `assigned_to` (uuid, nullable, FK to profiles ON DELETE SET NULL)
- Add `created_by_contact_id` (uuid, nullable, FK to contacts ON DELETE SET NULL)

## 3. Indexes
- Index on project_tasks(assigned_to), project_tasks(source), project_tasks(visibility)

## Security
- No RLS policy changes. Existing project_tasks policies already scope by organization_id.

## Notes
- Existing project_tasks rows get column defaults automatically — no backfill needed.
- No triggers or functions are modified in this migration.
*/

-- ============================================================
-- 1. Add test_tune_started_at to projects
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'test_tune_started_at'
  ) THEN
    ALTER TABLE projects ADD COLUMN test_tune_started_at timestamptz;
  END IF;
END $$;

-- ============================================================
-- 2. Add source, visibility, assigned_to, created_by_contact_id to project_tasks
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_tasks' AND column_name = 'source'
  ) THEN
    ALTER TABLE project_tasks ADD COLUMN source text NOT NULL DEFAULT 'proposal';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_tasks' AND column_name = 'visibility'
  ) THEN
    ALTER TABLE project_tasks ADD COLUMN visibility text NOT NULL DEFAULT 'internal';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_tasks' AND column_name = 'assigned_to'
  ) THEN
    ALTER TABLE project_tasks ADD COLUMN assigned_to uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_tasks' AND column_name = 'created_by_contact_id'
  ) THEN
    ALTER TABLE project_tasks ADD COLUMN created_by_contact_id uuid;
  END IF;
END $$;

-- Add CHECK constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_tasks_source_check' AND conrelid = 'project_tasks'::regclass
  ) THEN
    ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_source_check
      CHECK (source IN ('proposal', 'manual', 'customer'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_tasks_visibility_check' AND conrelid = 'project_tasks'::regclass
  ) THEN
    ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_visibility_check
      CHECK (visibility IN ('internal', 'customer_visible'));
  END IF;
END $$;

-- Add foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_tasks_assigned_to_fkey' AND conrelid = 'project_tasks'::regclass
  ) THEN
    ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_assigned_to_fkey
      FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_tasks_created_by_contact_id_fkey' AND conrelid = 'project_tasks'::regclass
  ) THEN
    ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_created_by_contact_id_fkey
      FOREIGN KEY (created_by_contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- 3. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_project_tasks_assigned_to ON project_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_project_tasks_source ON project_tasks(source);
CREATE INDEX IF NOT EXISTS idx_project_tasks_visibility ON project_tasks(visibility);