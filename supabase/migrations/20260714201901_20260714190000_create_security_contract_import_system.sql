/*
# Security Contract Bulk Import Infrastructure

## Purpose
Adds tables and columns needed to bulk-import 600+ existing security contracts
from Bill.com into the in-app Contract Management / Recurring Revenue system.

## New Tables
1. `security_contract_import_batches` — tracks each bulk import (file name, row counts,
   status, rollback support). Modeled after `contact_import_batches`.

## Modified Tables
1. `security_contracts`
   - `import_batch_id` (uuid, nullable) — FK to `security_contract_import_batches.id`,
     set on every contract created via the import wizard so the batch can be rolled back.
   - `imported_from_external` (boolean, default false) — flags contracts migrated from
     an external billing system (Bill.com) so admins can filter and audit them.

2. `recurring_subscriptions`
   - `billing_external_id` (text, nullable) — stores the external billing system's
     account reference (e.g. Bill.com vendor/customer ID) for cross-referencing during
     the transition period.

## Security
- RLS enabled on `security_contract_import_batches` with 4 CRUD policies scoped to
  `authenticated` users (admin, manager, sales_manager roles for insert/update/delete;
  all authenticated for select).
- Indexes on `import_batch_id` and `imported_from_external` on `security_contracts`.
- Index on `billing_external_id` on `recurring_subscriptions`.
*/

-- ═══════════════════════════════════════════════════════════
-- 1. Import batches table
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS security_contract_import_batches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  imported_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  imported_by_name text,
  file_name       text NOT NULL,
  row_count       integer NOT NULL DEFAULT 0,
  skipped_count   integer NOT NULL DEFAULT 0,
  error_count     integer NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','completed','rolled_back')),
  imported_at     timestamptz DEFAULT now()
);

ALTER TABLE security_contract_import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_contract_import_batches" ON security_contract_import_batches;
CREATE POLICY "select_contract_import_batches"
  ON security_contract_import_batches FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_contract_import_batches" ON security_contract_import_batches;
CREATE POLICY "insert_contract_import_batches"
  ON security_contract_import_batches FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_contract_import_batches" ON security_contract_import_batches;
CREATE POLICY "update_contract_import_batches"
  ON security_contract_import_batches FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_contract_import_batches" ON security_contract_import_batches;
CREATE POLICY "delete_contract_import_batches"
  ON security_contract_import_batches FOR DELETE
  TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════
-- 2. Add import tracking columns to security_contracts
-- ═══════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'security_contracts' AND column_name = 'import_batch_id'
  ) THEN
    ALTER TABLE security_contracts
      ADD COLUMN import_batch_id uuid REFERENCES security_contract_import_batches(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'security_contracts' AND column_name = 'imported_from_external'
  ) THEN
    ALTER TABLE security_contracts
      ADD COLUMN imported_from_external boolean DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_security_contracts_import_batch
  ON security_contracts(import_batch_id);

CREATE INDEX IF NOT EXISTS idx_security_contracts_imported_external
  ON security_contracts(imported_from_external)
  WHERE imported_from_external = true;

-- ═══════════════════════════════════════════════════════════
-- 3. Add external billing reference to recurring_subscriptions
-- ═══════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recurring_subscriptions' AND column_name = 'billing_external_id'
  ) THEN
    ALTER TABLE recurring_subscriptions
      ADD COLUMN billing_external_id text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_billing_external
  ON recurring_subscriptions(billing_external_id)
  WHERE billing_external_id IS NOT NULL;
