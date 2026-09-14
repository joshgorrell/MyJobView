/*
# Phase 2: Add Task Lineage and Seeding Columns

## Purpose
This migration adds the infrastructure needed for the Catalog -> Proposal -> Project task pipeline:
1. `source_proposal_task_id` on `project_tasks` -- links project tasks back to the proposal tasks they were copied from
2. `tasks_seeded_at` on `proposal_line_items` -- one-time seeding marker to prevent re-seeding deleted tasks

## New Columns

### project_tasks.source_proposal_task_id
- Type: uuid, nullable
- FK to proposal_tasks(id) ON DELETE SET NULL
- Purpose: When a project task is created from a proposal task, this column stores the source proposal task ID
- Used for idempotency: a unique partial index ensures each proposal task is copied to a given project at most once

### proposal_line_items.tasks_seeded_at
- Type: timestamptz, nullable
- Purpose: Set to now() when the seeding function first creates proposal tasks for this line item
- If non-null, the seeding function skips this line item entirely (never re-seed, even if tasks were deleted)

## New Indexes

1. Unique partial index on project_tasks(project_id, source_proposal_task_id) WHERE source_proposal_task_id IS NOT NULL
   - Ensures each proposal task is copied to a given project exactly once
   - Manual project tasks (NULL source_proposal_task_id) are not constrained

2. Index on proposal_line_items(tasks_seeded_at)
   - Efficient filtering of unseeded line items

## Security
- No new tables created
- No RLS policy changes needed (existing policies cover the new columns)
- The new columns are nullable and do not affect existing row access

## Important Notes
1. Existing 20 project tasks get NULL for source_proposal_task_id -- they are not touched
2. Existing proposal line items get NULL for tasks_seeded_at -- they are not auto-seeded
3. The unique index is a PARTIAL index (only applies when source_proposal_task_id IS NOT NULL)
*/

-- Add source_proposal_task_id to project_tasks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_tasks' AND column_name = 'source_proposal_task_id'
  ) THEN
    ALTER TABLE project_tasks ADD COLUMN source_proposal_task_id uuid REFERENCES proposal_tasks(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add tasks_seeded_at to proposal_line_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_line_items' AND column_name = 'tasks_seeded_at'
  ) THEN
    ALTER TABLE proposal_line_items ADD COLUMN tasks_seeded_at timestamptz;
  END IF;
END $$;

-- Unique partial index: each proposal task copied to a given project at most once
CREATE UNIQUE INDEX IF NOT EXISTS project_tasks_unique_source_proposal_task
  ON project_tasks (project_id, source_proposal_task_id)
  WHERE source_proposal_task_id IS NOT NULL;

-- Index for filtering unseeded line items
CREATE INDEX IF NOT EXISTS idx_proposal_line_items_tasks_seeded_at
  ON proposal_line_items (tasks_seeded_at)
  WHERE tasks_seeded_at IS NULL;
