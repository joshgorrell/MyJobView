/*
# Create daily_recap_todos table

## Purpose
Stores per-sales-rep daily recap checklist items so reps can track what they need
to act on each morning (bill out work orders, review technician notes, follow up
with prospects, check on projects, attend appointments).  The checklist state
persists across devices.

## New Tables
- `daily_recap_todos`
  - `id` uuid PK
  - `organization_id` uuid (tenant scope, matches existing pattern)
  - `user_id` uuid NOT NULL DEFAULT auth.uid() (the rep who owns the checklist)
  - `recap_date` date NOT NULL (the day the item belongs to)
  - `item_type` text NOT NULL (billing | notes | follow_up | appointment | project)
  - `record_id` uuid (the related work_order / project / contact / appointment ID)
  - `title` text NOT NULL (human-readable summary shown in the checklist)
  - `subtitle` text (optional secondary line, e.g. customer name)
  - `is_completed` boolean NOT NULL DEFAULT false
  - `completed_at` timestamptz (when the rep checked it off)
  - `created_at` timestamptz DEFAULT now()
  - `updated_at` timestamptz DEFAULT now()

## Constraints
- UNIQUE (user_id, recap_date, item_type, record_id) — same item doesn't appear twice per day

## Security
- RLS enabled
- Each authenticated user can CRUD their own checklist items (auth.uid() = user_id)
- Managers/admins can SELECT (read) any rep's items within their org for coaching
- All policies scoped to organization_id via get_user_org_id()

## Indexes
- (user_id, recap_date) — primary query pattern
- (organization_id, recap_date) — manager view
*/

CREATE TABLE IF NOT EXISTS daily_recap_todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  recap_date date NOT NULL,
  item_type text NOT NULL CHECK (item_type IN ('billing','notes','follow_up','appointment','project')),
  record_id uuid,
  title text NOT NULL,
  subtitle text,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Unique constraint: one item per (user, date, type, record)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uniq_recap_todo_per_day'
  ) THEN
    ALTER TABLE daily_recap_todos
      ADD CONSTRAINT uniq_recap_todo_per_day UNIQUE (user_id, recap_date, item_type, record_id);
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recap_todos_user_date ON daily_recap_todos (user_id, recap_date);
CREATE INDEX IF NOT EXISTS idx_recap_todos_org_date ON daily_recap_todos (organization_id, recap_date);

-- Enable RLS
ALTER TABLE daily_recap_todos ENABLE ROW LEVEL SECURITY;

-- SELECT: own items OR (managers/admins in same org)
DROP POLICY IF EXISTS "select_own_recap_todos" ON daily_recap_todos;
CREATE POLICY "select_own_recap_todos"
ON daily_recap_todos FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR (
    organization_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin','manager','sales_manager')
    )
  )
);

-- INSERT: own items only
DROP POLICY IF EXISTS "insert_own_recap_todos" ON daily_recap_todos;
CREATE POLICY "insert_own_recap_todos"
ON daily_recap_todos FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- UPDATE: own items only (check off, uncheck)
DROP POLICY IF EXISTS "update_own_recap_todos" ON daily_recap_todos;
CREATE POLICY "update_own_recap_todos"
ON daily_recap_todos FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- DELETE: own items only
DROP POLICY IF EXISTS "delete_own_recap_todos" ON daily_recap_todos;
CREATE POLICY "delete_own_recap_todos"
ON daily_recap_todos FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION trigger_set_recap_todo_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_recap_todo_updated_at ON daily_recap_todos;
CREATE TRIGGER set_recap_todo_updated_at
  BEFORE UPDATE ON daily_recap_todos
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_recap_todo_updated_at();
