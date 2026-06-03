/*
  # Relax time_entry_requires_work_order_or_project constraint

  ## Problem
  The existing check constraint requires that exactly one of work_order_id or project_id
  is set (mutual exclusion + at least one). This blocks CSV imports where time entries
  don't have an associated work order or project (pure payroll/clock imports).

  ## Change
  Drop the constraint entirely so time entries can exist without a work order or project.
  Entries linked to a work order or project will still work correctly — the constraint
  was only preventing legitimate standalone time entries from being created.
*/

ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entry_requires_work_order_or_project;
