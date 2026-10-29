# Attendance award implementation discovery

Read-only inspection of the connected MJV database identified the live trigger function `public.check_late_clock_in()`.

Current conditions and awards:
- Arrival at least 15 minutes early: +10.
- Arrival earlier than start but less than 15 minutes early, or exactly at start: +5.
- Arrival after start and no more than 15 minutes late: -5.
- Arrival more than 15 minutes late: -10.

The routine checks employee payroll basis, effective-dated schedule, workdays, company holidays, approved leave, admin-adjusted punches, and company timezone. It uses a per-employee/date advisory lock, checks for an earlier offline punch, updates the attendance result and writes the net change to the points ledger.

Neither the existing `points_configuration` columns nor the `company_settings` columns expose these four attendance award values. These remain hardcoded in the database function.

Required next step: review and test a database migration that adds tenant-scoped attendance values and thresholds, updates this routine without weakening existing protections, and adds corresponding fields to the existing admin dashboard. No live database changes were made during discovery.
