/*
# Add scheduled_date column to work_orders

## Purpose
The Resource Day View and all dispatch scheduling components query and update
`work_orders.scheduled_date`, but this column did not exist on the table.
Every query filtering by `scheduled_date` was silently failing at runtime.

## Changes
1. New column: `work_orders.scheduled_date` (date, nullable)
   - Represents the calendar date a work order is scheduled for.
   - NULL means the work order is unscheduled (appears in the unscheduled tray).
   - Distinct from `start_date` which is the project-level start date.
2. Backfill: For work orders that have `scheduled_start_time` set (meaning they
   were time-scheduled), copy `start_date` into `scheduled_date` so they appear
   on the correct calendar day. Work orders without `scheduled_start_time`
   remain NULL (unscheduled).
3. Index: `idx_work_orders_scheduled_date` on `(scheduled_date)` for the common
   filter-by-date query pattern.
4. Index: `idx_work_orders_assigned_scheduled` on `(assigned_to, scheduled_date)`
   for the Resource Day View query that filters by technician + date.

## Security
No RLS policy changes. Existing `work_orders_*_same_org` policies cover the
new column automatically since they check `organization_id` at the row level.
*/