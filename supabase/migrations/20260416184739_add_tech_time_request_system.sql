/*
  # Add Technician Self-Service Time Request System

  ## Summary
  Extends the internal_time_sessions table to support technician-initiated requests
  for shop time and training time. Adds company_settings controls for admins to
  configure whether requests are enabled and whether they require approval.

  ## Modified Tables

  ### internal_time_sessions
  - `requested_by` (uuid, nullable FK to profiles) — who submitted the request (null = admin-created)
  - `request_reason` (text, nullable) — brief reason the tech provided
  - `denial_reason` (text, nullable) — reason a manager provided when denying
  - `status` CHECK constraint extended: adds 'pending_approval' and 'denied'

  ### company_settings
  - `shop_time_request_enabled` (boolean, default true) — allow techs to request shop time
  - `training_time_request_enabled` (boolean, default true) — allow techs to request training time
  - `time_request_requires_approval` (boolean, default true) — require manager approval before session starts

  ## Security Changes
  - New INSERT policy: techs may create their own pending requests (assigned_to = auth.uid())
  - New UPDATE policy: techs may cancel (only) their own pending requests
  - Existing admin/manager policies unchanged
*/

-- ──────────────────────────────────────────────
-- 1. Extend internal_time_sessions schema
-- ──────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'internal_time_sessions' AND column_name = 'requested_by'
  ) THEN
    ALTER TABLE internal_time_sessions ADD COLUMN requested_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'internal_time_sessions' AND column_name = 'request_reason'
  ) THEN
    ALTER TABLE internal_time_sessions ADD COLUMN request_reason text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'internal_time_sessions' AND column_name = 'denial_reason'
  ) THEN
    ALTER TABLE internal_time_sessions ADD COLUMN denial_reason text;
  END IF;
END $$;

-- Drop old constraint and recreate with the two new status values
ALTER TABLE internal_time_sessions DROP CONSTRAINT IF EXISTS internal_time_sessions_status_check;
ALTER TABLE internal_time_sessions
  ADD CONSTRAINT internal_time_sessions_status_check
  CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'pending_approval', 'denied'));

-- Index for tech-request lookups (pending requests by employee)
CREATE INDEX IF NOT EXISTS idx_internal_time_sessions_requested_by
  ON internal_time_sessions(requested_by);

-- ──────────────────────────────────────────────
-- 2. New RLS policies for technician self-service
-- ──────────────────────────────────────────────

-- Techs can submit their own pending requests
DROP POLICY IF EXISTS "Technicians can request their own internal sessions" ON internal_time_sessions;
CREATE POLICY "Technicians can request their own internal sessions"
  ON internal_time_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    assigned_to = auth.uid()
    AND requested_by = auth.uid()
    AND status = 'pending_approval'
  );

-- Techs can cancel their own pending (unapproved) requests only
DROP POLICY IF EXISTS "Technicians can cancel their own pending requests" ON internal_time_sessions;
CREATE POLICY "Technicians can cancel their own pending requests"
  ON internal_time_sessions FOR UPDATE
  TO authenticated
  USING (
    assigned_to = auth.uid()
    AND requested_by = auth.uid()
    AND status IN ('pending_approval')
  )
  WITH CHECK (
    assigned_to = auth.uid()
    AND requested_by = auth.uid()
    AND status = 'cancelled'
  );

-- ──────────────────────────────────────────────
-- 3. Add request feature flags to company_settings
-- ──────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'shop_time_request_enabled'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN shop_time_request_enabled boolean NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'training_time_request_enabled'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN training_time_request_enabled boolean NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'time_request_requires_approval'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN time_request_requires_approval boolean NOT NULL DEFAULT true;
  END IF;
END $$;
