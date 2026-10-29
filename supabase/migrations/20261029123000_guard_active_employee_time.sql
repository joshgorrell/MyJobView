-- Enforce one active job/internal activity per employee across all write paths.
-- An active activity is an unclosed draft/submitted time entry.
CREATE UNIQUE INDEX IF NOT EXISTS uq_time_entries_one_open_activity_per_employee
ON public.time_entries (technician_id)
WHERE clock_out IS NULL AND status IN ('draft', 'submitted');

-- Prevent an employee from ending their Daily Clock while a job, Shop Time,
-- Training or break is open at the punch timestamp. Preserve trusted manager
-- corrections and historical offline reconciliation for explicit review.
CREATE OR REPLACE FUNCTION time_private.guard_daily_clock_out_active_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.clock_out IS NULL OR (TG_OP = 'UPDATE' AND OLD.clock_out IS NOT NULL)
     THEN RETURN NEW; END IF;
  -- Only guard the employee's own clock-out. Manager correction remains
  -- available through existing permission and audit controls.
  IF auth.uid() IS DISTINCT FROM NEW.technician_id THEN RETURN NEW; END IF;
  PERFORM 1 FROM public.profiles WHERE id=NEW.technician_id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.time_entries t
    WHERE t.technician_id=NEW.technician_id
      AND t.clock_in < NEW.clock_out
      AND (t.clock_out IS NULL OR t.clock_out > NEW.clock_out)
      AND t.status IN ('draft','submitted','approved')
  ) THEN
    RAISE EXCEPTION 'Stop your active Job Time, Shop Time or Training before clocking out for the day';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.daily_clock_breaks b
    WHERE b.daily_clock_entry_id=NEW.id
      AND b.break_start < NEW.clock_out
      AND (b.break_end IS NULL OR b.break_end > NEW.clock_out)
  ) THEN
    RAISE EXCEPTION 'End your active break before clocking out for the day';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_daily_clock_out_active_activity ON public.daily_clock_entries;
CREATE TRIGGER guard_daily_clock_out_active_activity
BEFORE INSERT OR UPDATE OF clock_out ON public.daily_clock_entries
FOR EACH ROW EXECUTE FUNCTION time_private.guard_daily_clock_out_active_activity();
