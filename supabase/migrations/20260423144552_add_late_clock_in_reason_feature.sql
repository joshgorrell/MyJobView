/*\n  # Add Late Clock-In Reason Feature\n\n  ## Summary\n  Adds support for requiring hourly employees to provide a reason when clocking in late.\n\n  ## Changes\n\n  ### company_settings table\n  - `late_clock_in_reason_required` (boolean, default false) — when true, employees\n    who clock in more than 15 minutes after their scheduled start time must type a\n    reason before the clock-in is accepted.\n\n  ### daily_clock_entries table\n  - `late_clock_in_reason` (text, nullable) — stores the reason submitted by the\n    employee when they were late. Null when not late or feature is disabled.\n\n  ## Notes\n  - The 15-minute threshold mirrors the existing `trigger_check_late_clock_in` logic.\n  - The check is performed on the frontend before the insert fires, so the modal\n    fully gates the clock-in action.\n*/\n\n-- Add setting to company_settings\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'company_settings' AND column_name = 'late_clock_in_reason_required'\n  ) THEN\n    ALTER TABLE company_settings\n      ADD COLUMN late_clock_in_reason_required boolean DEFAULT false

\n  END IF

\nEND $$

\n\n-- Add reason storage to daily_clock_entries\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'daily_clock_entries' AND column_name = 'late_clock_in_reason'\n  ) THEN\n    ALTER TABLE daily_clock_entries\n      ADD COLUMN late_clock_in_reason text

\n  END IF

\nEND $$

\n
