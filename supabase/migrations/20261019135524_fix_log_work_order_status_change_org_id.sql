/*
# Fix log_work_order_status_change: set organization_id on insert

## Summary

The `log_work_order_status_change` trigger on `work_orders` inserts into
`job_status_history` without setting `organization_id`. The column is NOT NULL
with a default of `get_user_org_id()`, which returns NULL inside a trigger
(no authenticated user context). This caused a constraint violation when
completing a work order outside the frontend auth context.

## What This Fixes

Sets `organization_id` to `NEW.organization_id` (the work order's organization)
in the INSERT, so the status history record is correctly associated with the org.

## Functions Modified
- public.log_work_order_status_change — adds organization_id to the INSERT

## Important Notes
- This is a pre-existing bug, not caused by the punchlist corrective migration.
- It only surfaces when work order status changes happen outside the frontend
  auth context (e.g., via server-side functions or direct SQL).
- CREATE OR REPLACE FUNCTION makes this idempotent.
*/

CREATE OR REPLACE FUNCTION public.log_work_order_status_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = 'public' AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO job_status_history (
      work_order_id, technician_id, old_status, new_status,
      location_status, organization_id
    ) VALUES (
      NEW.id, NEW.assigned_to, OLD.status, NEW.status,
      NEW.current_location_status, NEW.organization_id
    );
    NEW.last_status_update = now();
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
