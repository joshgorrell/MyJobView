-- Enforce one active job/shop/training clock per technician across all clients.
-- Daily payroll clocks are deliberately excluded: they can run alongside job time.
-- Deployment fails safely if legacy overlapping open entries must first be reconciled.
CREATE UNIQUE INDEX IF NOT EXISTS time_entries_one_open_job_per_technician
  ON public.time_entries (technician_id)
  WHERE clock_out IS NULL
    AND technician_id IS NOT NULL;
