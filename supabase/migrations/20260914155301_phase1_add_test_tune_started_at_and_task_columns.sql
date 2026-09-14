/*
# Phase 1: Add test_tune_started_at to projects + source/visibility/assignment columns to project_tasks

## 1. projects table
- Add `test_tune_started_at` (timestamptz, nullable, default null)
  - Records the exact moment a project enters the Test & Tune period.
  - Currently the system uses `substantial_completion_date` (a date, not a timestamp)
    on the projects table as a proxy for T&T start. This new column provides a
    precise timestamp for the upcoming explicit T&T activation workflow (Phase 4).
  - No existing behavior changes — the column is added but not populated or
    referenced by any trigger or function in this migration.

## 2. project_tasks table
- Add `source` (text, NOT NULL, default 'proposal', CHECK in proposal/manual/customer)
  - Identifies where this task originated. Existing tasks default to 'proposal'
    since they were all generated from proposal line items.
- Add `visibility` (text, NOT NULL, default 'internal', CHECK in internal/customer_visible)
  - Controls whether a task is visible to customers in the portal. Existing tasks
    default to 'internal'.
- Add `assigned_to` (uuid, nullable, FK to profiles ON DELETE SET NULL)
  - Staff member assigned to this task. SET NULL if the profile is deleted so
    historical task records are preserved.
- Add `created_by_contact_id` (uuid, nullable, FK to contacts ON DELETE SET NULL)
  - For customer-originated tasks, the contact who created the task.
  - SET NULL if the contact is deleted so task records survive.

## 3. Indexes
- Index on project_tasks(assigned_to) for assignment queries
- Index on project_tasks(source) for filtering by origin
- Index on project_tasks(visibility) for portal visibility filtering

## Security
- No RLS policy changes. Existing project_tasks policies already scope by organization_id.
- New columns inherit the same organization-scoped access automatically.

## Notes
- Existing project_tasks rows get the column defaults (source='proposal',
  visibility='internal') automatically — no explicit backfill needed.
- No triggers or functions are modified in this migration.
*/