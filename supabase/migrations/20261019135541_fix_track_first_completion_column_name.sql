/*
# Fix track_first_completion: use correct column name

## Summary

The `track_first_completion` trigger function references `lp.labor_phase` which
does not exist on the `labor_phases` table. The actual column is `lp.name`.
This caused a constraint error when completing any work order with a
`labor_phase_id` set.

## What This Fixes

Changes `lp.labor_phase` to `lp.name` in both the EXISTS check and the
subquery in the UPDATE.

## Functions Modified
- public.track_first_completion — column reference corrected

## Important Notes
- This is a pre-existing bug, not caused by the punchlist corrective migration.
- CREATE OR REPLACE FUNCTION makes this idempotent.
*/

CREATE OR REPLACE FUNCTION public.track_first_completion()
RETURNS trigger LANGUAGE plpgsql SET search_path = 'public' AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    IF EXISTS (
      SELECT 1 FROM labor_phases lp
      WHERE lp.id = NEW.labor_phase_id
      AND lp.name = 'Field Labor'
    ) THEN
      UPDATE sales_orders
      SET
        first_completion_date = COALESCE(first_completion_date, NEW.completed_at),
        first_completion_hours = COALESCE(first_completion_hours, (
          SELECT SUM(COALESCE(wo.actual_hours, 0))
          FROM work_orders wo
          LEFT JOIN labor_phases lp ON lp.id = wo.labor_phase_id
          WHERE wo.sales_order_id = NEW.sales_order_id
          AND wo.status = 'completed'
          AND lp.name = 'Field Labor'
          AND wo.completed_at <= NEW.completed_at
        )),
        completion_attempts = CASE
          WHEN first_completion_date IS NULL THEN 1
          ELSE completion_attempts
        END,
        updated_at = now()
      WHERE id = NEW.sales_order_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
