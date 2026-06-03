/*
  # Fix project_tasks status: migrate 'pending' to 'open'

  ## Problem
  The SalesOrderProjectTab was creating tasks with status='pending', but
  WorkOrderTasksChecklist queries tasks with status='open'. This meant tasks
  marked via the project tab never appeared on work orders.

  ## Changes
  - Updates all existing project_tasks with status='pending' to status='open'
    so they become visible on work orders again
  - No schema change needed — 'open' is already a valid status value
*/

UPDATE project_tasks
SET status = 'open'
WHERE status = 'pending';
