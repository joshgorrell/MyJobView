/*
# Add optional job link columns to the assignments (tasks) table

1. New Columns
- `tasks.project_id` (uuid, nullable) — optional link to a project record.
- `tasks.work_order_id` (uuid, nullable) — optional link to a work order record.
- `tasks.proposal_id` (uuid, nullable) — optional link to a proposal record.

2. Purpose
An Assignment (stored in the `tasks` table) represents a request for action
between employees or departments. It may optionally reference a customer,
lead, proposal, project, or work order. A reference to a job does NOT make
an Assignment a Task — it is still an Assignment. These columns let
Assignments link to any relevant record without changing their nature.

3. Foreign Keys
- `project_id` → `projects(id) ON DELETE SET NULL`
- `work_order_id` → `work_orders(id) ON DELETE SET NULL`
- `proposal_id` → `proposals(id) ON DELETE SET NULL`

All columns are nullable and default to NULL so existing rows are unaffected.
ON DELETE SET NULL ensures deleting a job record does not delete the Assignment.

4. Security
No RLS policy changes needed. The existing restrictive policy
`tasks_respect_assignment_scope` and all permissive policies continue to apply
unchanged. The new columns are covered by the existing
`organization_id = get_user_org_id()` checks since they are simply nullable
reference columns within the same table.

5. Important Notes
- No data migration is needed. The table currently has 2 completed rows with
  no assignees and no comments. Both rows remain unchanged.
- The `tasks` table name is intentionally kept. It is the assignments table
  from a user-facing perspective, but renaming the table would require
  updating 9 triggers, 7 RLS policies, 2 RPC functions, and dozens of
  component references. The table name is an internal identifier; the
  user-facing label is controlled by the UI and department_modules
  display_name.
*/

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS work_order_id uuid REFERENCES public.work_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL;

-- Add indexes for the new link columns so scoped queries stay fast.
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON public.tasks (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_work_order_id ON public.tasks (work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_proposal_id ON public.tasks (proposal_id) WHERE proposal_id IS NOT NULL;
