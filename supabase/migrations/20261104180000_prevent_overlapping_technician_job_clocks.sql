-- Limit the concurrency guard to active job clocks; leave leave/PTO and other
-- time-entry categories outside the uniqueness rule.
-- Existing duplicates must be reconciled manually before this can deploy.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.time_entries
    WHERE clock_out IS NULL
      AND technician_id IS NOT NULL
      AND entry_type IN ('work_order', 'project', 'customer_activity', 'shop_time', 'training')
    GROUP BY organization_id, technician_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Overlapping active job clocks exist. Resolve them before applying the one-active-job constraint.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_one_open_job_per_technician
  ON public.time_entries (organization_id, technician_id)
  WHERE clock_out IS NULL
    AND technician_id IS NOT NULL
    AND entry_type IN ('work_order', 'project', 'customer_activity', 'shop_time', 'training');
