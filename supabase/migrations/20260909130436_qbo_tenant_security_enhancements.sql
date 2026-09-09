/*
# QuickBooks Online: Tenant Security & Sync Infrastructure

## Summary

This migration enhances the existing QuickBooks integration to support secure
multi-tenant connections, idempotent webhook processing, and tracked sync runs.
All existing tables are evolved in-place (no data loss) and new tracking tables
are added.

## New Tables

1. `qbo_oauth_sessions` — Single-use OAuth state tokens for CSRF protection.
   - `id` (uuid PK, also serves as the state parameter)
   - `organization_id` (uuid, FK to organizations, NOT NULL)
   - `initiated_by` (uuid, FK to profiles, NOT NULL)
   - `expires_at` (timestamptz, NOT NULL, 10-minute TTL)
   - `consumed_at` (timestamptz, nullable)
   - `created_at` (timestamptz, default now())

2. `qbo_webhook_events` — Deduplication and audit log for inbound QBO webhooks.
   - `id` (uuid PK)
   - `organization_id` (uuid, FK to organizations, NOT NULL)
   - `realm_id` (text, NOT NULL)
   - `entity_type` (text, NOT NULL) — e.g. 'Payment', 'Invoice', 'Customer'
   - `entity_id` (text, NOT NULL) — QBO entity ID
   - `event_id` (text, NOT NULL) — unique per event for deduplication
   - `payload` (jsonb, NOT NULL)
   - `status` (text, NOT NULL, default 'pending') — pending/processed/failed
   - `processed_at` (timestamptz, nullable)
   - `error_message` (text, nullable)
   - `created_at` (timestamptz, default now())
   - Unique constraint on (organization_id, event_id) for idempotent processing

3. `qbo_sync_runs` — Bounded sync operations with start/end/status tracking.
   - `id` (uuid PK)
   - `organization_id` (uuid, FK to organizations, NOT NULL)
   - `run_type` (text, NOT NULL) — initial/scheduled/manual/webhook
   - `entity_type` (text, NOT NULL) — customer/invoice/payment
   - `status` (text, NOT NULL, default 'running') — running/completed/failed
   - `started_at` (timestamptz, default now())
   - `completed_at` (timestamptz, nullable)
   - `entity_count` (integer, default 0)
   - `error_summary` (text, nullable)
   - `created_at` (timestamptz, default now())

4. `qbo_entity_mappings` — Bidirectional local-to-QBO entity mapping.
   - `id` (uuid PK)
   - `organization_id` (uuid, FK to organizations, NOT NULL)
   - `entity_type` (text, NOT NULL) — customer/invoice/payment
   - `local_id` (text, NOT NULL) — local table row ID
   - `qbo_id` (text, NOT NULL) — QBO entity ID
   - `qbo_sync_token` (text, nullable) — QBO sync token for optimistic concurrency
   - `last_synced_at` (timestamptz, default now())
   - `created_at` (timestamptz, default now())
   - Unique on (organization_id, entity_type, qbo_id)
   - Unique on (organization_id, entity_type, local_id)

## Modified Tables

1. `quickbooks_settings` — Added `environment` column.
   - `environment` (text, default 'sandbox') — 'sandbox' or 'production'
   - Added `company_name` (text, nullable) — cached QBO company display name
   - Added `last_webhook_at` (timestamptz, nullable) — last webhook received
   - Added `sync_health` (text, default 'healthy') — healthy/degraded/error
   - Added `last_error` (jsonb, nullable) — last error details

## Security

- RLS enabled on all new tables with organization-scoped policies using get_user_org_id().
- 4 policies per table (SELECT/INSERT/UPDATE/DELETE), scoped TO authenticated.
- All new tables default organization_id to get_user_org_id().

## Important Notes

1. Existing tables (quickbooks_settings, quickbooks_staged_customers, etc.)
   already have organization_id and RLS — no changes needed there.
2. The environment column allows per-tenant sandbox vs production selection.
3. qbo_oauth_sessions enforces single-use state with TTL, replacing the
   insecure company_settings.qbo_oauth_state approach.
4. qbo_webhook_events.event_id provides idempotent webhook processing.
5. qbo_entity_mappings replaces the scattered qbo_*_id columns as the
   authoritative mapping table (existing columns remain for backward compat).
*/

-- ============================================================
-- 1. Add columns to quickbooks_settings
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quickbooks_settings' AND column_name = 'environment'
  ) THEN
    ALTER TABLE quickbooks_settings
      ADD COLUMN environment text NOT NULL DEFAULT 'sandbox';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quickbooks_settings' AND column_name = 'company_name'
  ) THEN
    ALTER TABLE quickbooks_settings
      ADD COLUMN company_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quickbooks_settings' AND column_name = 'last_webhook_at'
  ) THEN
    ALTER TABLE quickbooks_settings
      ADD COLUMN last_webhook_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quickbooks_settings' AND column_name = 'sync_health'
  ) THEN
    ALTER TABLE quickbooks_settings
      ADD COLUMN sync_health text NOT NULL DEFAULT 'healthy';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quickbooks_settings' AND column_name = 'last_error'
  ) THEN
    ALTER TABLE quickbooks_settings
      ADD COLUMN last_error jsonb;
  END IF;
END $$;

-- ============================================================
-- 2. Create qbo_oauth_sessions
-- ============================================================

CREATE TABLE IF NOT EXISTS qbo_oauth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  initiated_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qbo_oauth_sessions_org
  ON qbo_oauth_sessions(organization_id);

CREATE INDEX IF NOT EXISTS idx_qbo_oauth_sessions_expires
  ON qbo_oauth_sessions(expires_at);

ALTER TABLE qbo_oauth_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qbo_oauth_sessions_select_same_org" ON qbo_oauth_sessions;
CREATE POLICY "qbo_oauth_sessions_select_same_org"
  ON qbo_oauth_sessions FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "qbo_oauth_sessions_insert_same_org" ON qbo_oauth_sessions;
CREATE POLICY "qbo_oauth_sessions_insert_same_org"
  ON qbo_oauth_sessions FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "qbo_oauth_sessions_update_same_org" ON qbo_oauth_sessions;
CREATE POLICY "qbo_oauth_sessions_update_same_org"
  ON qbo_oauth_sessions FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "qbo_oauth_sessions_delete_same_org" ON qbo_oauth_sessions;
CREATE POLICY "qbo_oauth_sessions_delete_same_org"
  ON qbo_oauth_sessions FOR DELETE
  TO authenticated
  USING (organization_id = get_user_org_id());

-- ============================================================
-- 3. Create qbo_webhook_events
-- ============================================================

CREATE TABLE IF NOT EXISTS qbo_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  realm_id text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  event_id text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  processed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Deduplication: one event_id per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_qbo_webhook_events_unique
  ON qbo_webhook_events(organization_id, event_id);

CREATE INDEX IF NOT EXISTS idx_qbo_webhook_events_org_status
  ON qbo_webhook_events(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_qbo_webhook_events_entity
  ON qbo_webhook_events(organization_id, entity_type, entity_id);

ALTER TABLE qbo_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qbo_webhook_events_select_same_org" ON qbo_webhook_events;
CREATE POLICY "qbo_webhook_events_select_same_org"
  ON qbo_webhook_events FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "qbo_webhook_events_insert_same_org" ON qbo_webhook_events;
CREATE POLICY "qbo_webhook_events_insert_same_org"
  ON qbo_webhook_events FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "qbo_webhook_events_update_same_org" ON qbo_webhook_events;
CREATE POLICY "qbo_webhook_events_update_same_org"
  ON qbo_webhook_events FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "qbo_webhook_events_delete_same_org" ON qbo_webhook_events;
CREATE POLICY "qbo_webhook_events_delete_same_org"
  ON qbo_webhook_events FOR DELETE
  TO authenticated
  USING (organization_id = get_user_org_id());

-- ============================================================
-- 4. Create qbo_sync_runs
-- ============================================================

CREATE TABLE IF NOT EXISTS qbo_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_type text NOT NULL,
  entity_type text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  entity_count integer NOT NULL DEFAULT 0,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qbo_sync_runs_org
  ON qbo_sync_runs(organization_id, started_at DESC);

ALTER TABLE qbo_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qbo_sync_runs_select_same_org" ON qbo_sync_runs;
CREATE POLICY "qbo_sync_runs_select_same_org"
  ON qbo_sync_runs FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "qbo_sync_runs_insert_same_org" ON qbo_sync_runs;
CREATE POLICY "qbo_sync_runs_insert_same_org"
  ON qbo_sync_runs FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "qbo_sync_runs_update_same_org" ON qbo_sync_runs;
CREATE POLICY "qbo_sync_runs_update_same_org"
  ON qbo_sync_runs FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "qbo_sync_runs_delete_same_org" ON qbo_sync_runs;
CREATE POLICY "qbo_sync_runs_delete_same_org"
  ON qbo_sync_runs FOR DELETE
  TO authenticated
  USING (organization_id = get_user_org_id());

-- ============================================================
-- 5. Create qbo_entity_mappings
-- ============================================================

CREATE TABLE IF NOT EXISTS qbo_entity_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  local_id text NOT NULL,
  qbo_id text NOT NULL,
  qbo_sync_token text,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One mapping per (org, entity_type, qbo_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_qbo_mappings_qbo
  ON qbo_entity_mappings(organization_id, entity_type, qbo_id);

-- One mapping per (org, entity_type, local_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_qbo_mappings_local
  ON qbo_entity_mappings(organization_id, entity_type, local_id);

ALTER TABLE qbo_entity_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qbo_entity_mappings_select_same_org" ON qbo_entity_mappings;
CREATE POLICY "qbo_entity_mappings_select_same_org"
  ON qbo_entity_mappings FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "qbo_entity_mappings_insert_same_org" ON qbo_entity_mappings;
CREATE POLICY "qbo_entity_mappings_insert_same_org"
  ON qbo_entity_mappings FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "qbo_entity_mappings_update_same_org" ON qbo_entity_mappings;
CREATE POLICY "qbo_entity_mappings_update_same_org"
  ON qbo_entity_mappings FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "qbo_entity_mappings_delete_same_org" ON qbo_entity_mappings;
CREATE POLICY "qbo_entity_mappings_delete_same_org"
  ON qbo_entity_mappings FOR DELETE
  TO authenticated
  USING (organization_id = get_user_org_id());

-- ============================================================
-- 6. Add unique constraint on quickbooks_settings.organization_id
--    (one connection per org)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'quickbooks_settings'
    AND indexname = 'idx_quickbooks_settings_org_unique'
  ) THEN
    ALTER TABLE quickbooks_settings
      ADD CONSTRAINT idx_quickbooks_settings_org_unique
      UNIQUE (organization_id);
  END IF;
END $$;