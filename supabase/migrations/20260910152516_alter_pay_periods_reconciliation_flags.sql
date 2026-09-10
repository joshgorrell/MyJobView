/*
# Alter pay_periods and payroll_reconciliation_flags for employee/payroll architecture

## Purpose
Adds pay schedule linking and reopen audit trail to pay_periods, and adds reconciliation type, excluded hours, and resolution note constraints to payroll_reconciliation_flags.

## Changes to pay_periods
- pay_schedule_id (uuid, nullable, FK to pay_schedules) — links period to its pay schedule
- reopened_by (uuid, nullable, FK to profiles) — who reopened the period
- reopened_at (timestamptz, nullable) — when it was reopened
- reopen_reason (text, nullable) — why it was reopened

## Changes to payroll_reconciliation_flags
- excluded_hours (numeric, default 0) — hours excluded from payroll
- exclusion_reason (text, nullable) — why hours were excluded
- reconciliation_type (text, default 'payroll', CHECK: payroll/attendance/allocation) — categorizes the flag
- CHECK constraint: resolution_note IS NOT NULL WHEN resolution_status IN ('resolved', 'ignored')

## Important Notes
1. All additions are nullable/defaulted so existing rows are unaffected.
2. pay_schedule_id on pay_periods is nullable for backward compatibility with existing periods.
3. reconciliation_type defaults to 'payroll' so existing flags remain payroll-type.
*/

-- pay_periods additions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pay_periods' AND column_name = 'pay_schedule_id'
  ) THEN
    ALTER TABLE pay_periods ADD COLUMN pay_schedule_id uuid REFERENCES pay_schedules(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pay_periods' AND column_name = 'reopened_by'
  ) THEN
    ALTER TABLE pay_periods ADD COLUMN reopened_by uuid REFERENCES profiles(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pay_periods' AND column_name = 'reopened_at'
  ) THEN
    ALTER TABLE pay_periods ADD COLUMN reopened_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pay_periods' AND column_name = 'reopen_reason'
  ) THEN
    ALTER TABLE pay_periods ADD COLUMN reopen_reason text;
  END IF;
END $$;

-- payroll_reconciliation_flags additions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_reconciliation_flags' AND column_name = 'excluded_hours'
  ) THEN
    ALTER TABLE payroll_reconciliation_flags ADD COLUMN excluded_hours numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_reconciliation_flags' AND column_name = 'exclusion_reason'
  ) THEN
    ALTER TABLE payroll_reconciliation_flags ADD COLUMN exclusion_reason text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_reconciliation_flags' AND column_name = 'reconciliation_type'
  ) THEN
    ALTER TABLE payroll_reconciliation_flags ADD COLUMN reconciliation_type text NOT NULL DEFAULT 'payroll' CHECK (reconciliation_type IN ('payroll', 'attendance', 'allocation'));
  END IF;
END $$;

-- CHECK constraint: resolution_note required when resolved or ignored
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prf_resolution_note_required'
  ) THEN
    ALTER TABLE payroll_reconciliation_flags
    ADD CONSTRAINT prf_resolution_note_required
    CHECK (
      resolution_status NOT IN ('resolved', 'ignored')
      OR resolution_note IS NOT NULL
    );
  END IF;
END $$;

-- Index for pay_periods by pay_schedule
CREATE INDEX IF NOT EXISTS pay_periods_pay_schedule_idx
  ON pay_periods (pay_schedule_id);

-- Index for reconciliation flags by type
CREATE INDEX IF NOT EXISTS prf_reconciliation_type_idx
  ON payroll_reconciliation_flags (reconciliation_type);
