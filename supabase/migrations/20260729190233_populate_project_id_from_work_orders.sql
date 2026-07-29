/*
# Auto-populate project_id on work-order child tables

## Purpose
When a technician clocks time, requests parts, or logs materials on a project work order,
those records must be directly linked to the parent project — not just to the work order.
Previously, `time_entries.project_id` and `product_requests.project_id` columns existed but were
never populated by the application, and `service_parts_used` had no `project_id` column at all.
This meant project-level rollups of time, parts, and materials were incomplete or required
JOINs through `work_orders` to resolve.

## Changes

### 1. New column: `service_parts_used.project_id`
- Adds `project_id uuid REFERENCES projects(id) ON DELETE SET NULL` to `service_parts_used`.
- Mirrors the pattern already used on `time_entries` and `product_requests`.

### 2. New trigger function: `set_project_id_from_work_order()`
- A SECURITY DEFINER function that looks up `project_id` from `work_orders` for the given
  `work_order_id` and sets `NEW.project_id` if it is NULL.
- Works for all three tables: `time_entries`, `product_requests`, `service_parts_used`.

### 3. New triggers
- `trg_time_entries_set_project_id` — BEFORE INSERT on `time_entries`.
- `trg_product_requests_set_project_id` — BEFORE INSERT on `product_requests`.
- `trg_service_parts_used_set_project_id` — BEFORE INSERT on `service_parts_used`.

### 4. Backfill existing data
- Updates all existing rows with a `work_order_id` but NULL `project_id` across all three tables.

### 5. Index
- Adds an index on `service_parts_used.project_id` for project-level queries.

## Security
- No RLS policy changes — the new column inherits the table's existing RLS policies.
- The trigger function is SECURITY DEFINER so it can resolve `work_orders.project_id`
  regardless of the calling role, but it only reads (not writes) from `work_orders`.
*/

-- 1. Add project_id to service_parts_used
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'service_parts_used' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE service_parts_used
      ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_service_parts_used_project_id
  ON service_parts_used(project_id);

-- 2. Trigger function
CREATE OR REPLACE FUNCTION public.set_project_id_from_work_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  IF NEW.project_id IS NULL AND NEW.work_order_id IS NOT NULL THEN
    SELECT project_id INTO v_project_id
      FROM public.work_orders
      WHERE id = NEW.work_order_id;

    IF v_project_id IS NOT NULL THEN
      NEW.project_id := v_project_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Triggers
DROP TRIGGER IF EXISTS trg_time_entries_set_project_id ON time_entries;
CREATE TRIGGER trg_time_entries_set_project_id
  BEFORE INSERT ON time_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_project_id_from_work_order();

DROP TRIGGER IF EXISTS trg_product_requests_set_project_id ON product_requests;
CREATE TRIGGER trg_product_requests_set_project_id
  BEFORE INSERT ON product_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_project_id_from_work_order();

DROP TRIGGER IF EXISTS trg_service_parts_used_set_project_id ON service_parts_used;
CREATE TRIGGER trg_service_parts_used_set_project_id
  BEFORE INSERT ON service_parts_used
  FOR EACH ROW EXECUTE FUNCTION public.set_project_id_from_work_order();

-- 4. Backfill existing rows
UPDATE time_entries te
  SET project_id = wo.project_id
  FROM work_orders wo
  WHERE te.work_order_id = wo.id
    AND te.project_id IS NULL
    AND wo.project_id IS NOT NULL;

UPDATE product_requests pr
  SET project_id = wo.project_id
  FROM work_orders wo
  WHERE pr.work_order_id = wo.id
    AND pr.project_id IS NULL
    AND wo.project_id IS NOT NULL;

UPDATE service_parts_used spu
  SET project_id = wo.project_id
  FROM work_orders wo
  WHERE spu.work_order_id = wo.id
    AND spu.project_id IS NULL
    AND wo.project_id IS NOT NULL;
