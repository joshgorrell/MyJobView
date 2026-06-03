/*
  # Contract Commission System

  ## Overview
  Extends the commission system to support contract-based sales (security contracts,
  VIP plans, service plans). Commission is earned at point of sale using the formula:
    Term Months × Monthly Amount = Total Contract Value × Commission Rate % = Commission

  ## Changes

  ### Modified Tables
  - `company_commission_settings` — adds `default_contract_commission_rate` (default 7%)
  - `employee_commission_config` — adds `custom_contract_commission_rate` per-rep override

  ### New Tables
  - `contract_commission_records` — stores one row per contract sale per rep; preserves
    the commission calculation at the time of sale for historical accuracy.

  ## Security
  - RLS enabled on `contract_commission_records`
  - All authenticated org members can read; insert/update/delete require authentication
*/

-- ─── Extend company_commission_settings ─────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_commission_settings'
      AND column_name = 'default_contract_commission_rate'
  ) THEN
    ALTER TABLE company_commission_settings
      ADD COLUMN default_contract_commission_rate numeric(5,2) DEFAULT 7.00;
  END IF;
END $$;

-- ─── Extend employee_commission_config ──────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employee_commission_config'
      AND column_name = 'custom_contract_commission_rate'
  ) THEN
    ALTER TABLE employee_commission_config
      ADD COLUMN custom_contract_commission_rate numeric(5,2) DEFAULT NULL;
  END IF;
END $$;

-- ─── contract_commission_records ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contract_commission_records (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL,
  employee_id           uuid REFERENCES profiles(id) ON DELETE SET NULL,
  source_type           text NOT NULL DEFAULT 'security_contract'
                          CHECK (source_type IN ('security_contract','vip_plan','service_plan','other')),
  source_id             uuid,                          -- FK to security_contracts.id or recurring_subscriptions.id
  contract_number       text DEFAULT '',
  customer_name         text DEFAULT '',
  monthly_amount        numeric(12,2) NOT NULL DEFAULT 0,
  term_months           integer NOT NULL DEFAULT 12,
  total_contract_value  numeric(12,2) GENERATED ALWAYS AS (monthly_amount * term_months) STORED,
  commission_rate       numeric(5,2) NOT NULL DEFAULT 7,
  commission_amount     numeric(12,2) GENERATED ALWAYS AS
                          (ROUND((monthly_amount * term_months * commission_rate / 100), 2)) STORED,
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','paid')),
  sale_date             date,
  pay_period_start      date,
  pay_period_end        date,
  notes                 text DEFAULT '',
  created_by            uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

ALTER TABLE contract_commission_records ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ccr_org_id
  ON contract_commission_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_ccr_employee_id
  ON contract_commission_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_ccr_source
  ON contract_commission_records(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_ccr_sale_date
  ON contract_commission_records(sale_date);
CREATE INDEX IF NOT EXISTS idx_ccr_status
  ON contract_commission_records(status);

-- Read
CREATE POLICY "Org members can view contract commission records"
  ON contract_commission_records FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Insert
CREATE POLICY "Authenticated users can insert contract commission records"
  ON contract_commission_records FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Update
CREATE POLICY "Authenticated users can update contract commission records"
  ON contract_commission_records FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Delete
CREATE POLICY "Authenticated users can delete contract commission records"
  ON contract_commission_records FOR DELETE
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );
