/*
# QBO 1.1: Concurrency-Safe Token Refresh & Reconciliation Infrastructure

## Summary

This migration adds the database infrastructure needed for:
1. Concurrency-safe QBO token refresh (optimistic locking via token version)
2. Reconciliation tracking (last reconciliation timestamp + discrepancy log table)
3. Sync status tracking for customer/invoice/payment sync health

## New Columns on quickbooks_settings

- `token_version` (integer, default 0) — incremented on every token refresh.
  Used in a compare-and-update WHERE clause so two concurrent refreshes
  cannot overwrite each other's rotated refresh token.
- `last_reconciliation_at` (timestamptz, nullable) — timestamp of the last
  read-only reconciliation run.
- `last_invoice_sync_at` (timestamptz, nullable) — timestamp of the last
  invoice sync.
- `last_payment_sync_at` (timestamptz, nullable) — timestamp of the last
  payment sync.
- `invoice_sync_status` (text, default 'idle') — idle/running/error.
- `payment_sync_status` (text, default 'idle') — idle/running/error.
- `customer_sync_status` (text, default 'idle') — idle/running/error.

## New Table: qbo_reconciliation_results

Stores discrepancy records from read-only reconciliation runs.

- `id` (uuid PK)
- `organization_id` (uuid FK to organizations, NOT NULL)
- `entity_type` (text NOT NULL) — customer/invoice/payment
- `local_id` (text, nullable)
- `qbo_id` (text, nullable)
- `discrepancy_type` (text NOT NULL) — e.g. missing_in_qbo, missing_in_mjv, amount_mismatch, status_mismatch, duplicate_candidate
- `local_value` (jsonb, nullable)
- `qbo_value` (jsonb, nullable)
- `resolution_status` (text, default 'pending') — pending/resolved/ignored
- `resolution_notes` (text, nullable)
- `created_at` (timestamptz, default now())
- `resolved_at` (timestamptz, nullable)

## Security

- RLS enabled on qbo_reconciliation_results with organization-scoped policies.
- 4 policies (SELECT/INSERT/UPDATE/DELETE), scoped TO authenticated.
- Column-level grants on quickbooks_settings remain as-is (secrets already
  protected by the qbo_protect_connection_secrets migration).

## Important Notes

1. token_version is used in the WHERE clause of the token refresh UPDATE so
   that if another request already refreshed and rotated the token, the
   stale request's update affects zero rows and the function can re-read
   the current token instead of overwriting it.
2. The reconciliation results table is write-once per discrepancy; resolved
   discrepancies are marked, not deleted, preserving the audit trail.
3. No existing data is modified or deleted.
*/

-- ============================================================
-- 1. Add columns to quickbooks_settings
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quickbooks_settings' AND column_name = 'token_version'
  ) THEN
    ALTER TABLE quickbooks_settings
      ADD COLUMN token_version integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quickbooks_settings' AND column_name = 'last_reconciliation_at'
  ) THEN
    ALTER TABLE quickbooks_settings
      ADD COLUMN last_reconciliation_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quickbooks_settings' AND column_name = 'last_invoice_sync_at'
  ) THEN
    ALTER TABLE quickbooks_settings
      ADD COLUMN last_invoice_sync_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quickbooks_settings' AND column_name = 'last_payment_sync_at'
  ) THEN
    ALTER TABLE quickbooks_settings
      ADD COLUMN last_payment_sync_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quickbooks_settings' AND column_name = 'invoice_sync_status'
  ) THEN
    ALTER TABLE quickbooks_settings
      ADD COLUMN invoice_sync_status text NOT NULL DEFAULT 'idle';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quickbooks_settings' AND column_name = 'payment_sync_status'
  ) THEN
    ALTER TABLE quickbooks_settings
      ADD COLUMN payment_sync_status text NOT NULL DEFAULT 'idle';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quickbooks_settings' AND column_name = 'customer_sync_status'
  ) THEN
    ALTER TABLE quickbooks_settings
      ADD COLUMN customer_sync_status text NOT NULL DEFAULT 'idle';
  END IF;
END $$;

-- Grant SELECT on the new non-secret columns to authenticated
-- (The existing column-level grant from qbo_protect_connection_secrets
--  already covers the non-secret columns. We need to add the new ones.)
GRANT SELECT (
  last_reconciliation_at,
  last_invoice_sync_at,
  last_payment_sync_at,
  invoice_sync_status,
  payment_sync_status,
  customer_sync_status
) ON quickbooks_settings TO authenticated;

-- ============================================================
-- 2. Create qbo_reconciliation_results
-- ============================================================

CREATE TABLE IF NOT EXISTS qbo_reconciliation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  local_id text,
  qbo_id text,
  discrepancy_type text NOT NULL,
  local_value jsonb,
  qbo_value jsonb,
  resolution_status text NOT NULL DEFAULT 'pending',
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_qbo_recon_results_org
  ON qbo_reconciliation_results(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_qbo_recon_results_entity
  ON qbo_reconciliation_results(organization_id, entity_type, resolution_status);

ALTER TABLE qbo_reconciliation_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qbo_recon_results_select_same_org" ON qbo_reconciliation_results;
CREATE POLICY "qbo_recon_results_select_same_org"
  ON qbo_reconciliation_results FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "qbo_recon_results_insert_same_org" ON qbo_reconciliation_results;
CREATE POLICY "qbo_recon_results_insert_same_org"
  ON qbo_reconciliation_results FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "qbo_recon_results_update_same_org" ON qbo_reconciliation_results;
CREATE POLICY "qbo_recon_results_update_same_org"
  ON qbo_reconciliation_results FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "qbo_recon_results_delete_same_org" ON qbo_reconciliation_results;
CREATE POLICY "qbo_recon_results_delete_same_org"
  ON qbo_reconciliation_results FOR DELETE
  TO authenticated
  USING (organization_id = get_user_org_id());
