/*
# Stage A.5: Create tax_snapshots Table

## Purpose
Creates the `tax_snapshots` table to store an immutable record of exactly how tax was calculated
for a given transaction (proposal, invoice, change order, or recurring plan). The future central
tax engine will write a snapshot every time it computes tax, so there is always an auditable trail
of what rates, rules, and amounts were used.

## New Table: tax_snapshots
Columns capture the full context of a tax calculation:
- Identity: id, organization_id, transaction_type, transaction_id, contact_id
- Tax location: taxable_status, tax_location_address (jsonb), state, jurisdiction_name
- Tax rates: state_rate, county_rate, city_rate, district_rate, combined_rate
- TaxJar verification: taxjar_verified_at, nexus_result
- Scenario: environment, project_type, matrix_rule_version
- Amounts by classification: material_amount/taxable, labor_amount/taxable,
  design_fee_amount/taxable, pm_amount/taxable, freight_amount/taxable,
  credit_card_fee_amount/taxable
- Misc: misc_percent, misc_applies_to, misc_amount
- Custom modifiers: custom_modifier_1_amount/taxable, custom_modifier_2_amount/taxable
- Exemption: exemption_reference (nullable)
- Totals: taxable_subtotal, sales_tax, calculated_at

## Modified Tables
- `proposals` — adds nullable `tax_snapshot_id` FK to tax_snapshots(id) ON DELETE SET NULL
- `invoices` — adds nullable `tax_snapshot_id` FK
- `change_orders` — adds nullable `tax_snapshot_id` FK

## Security
- RLS enabled on tax_snapshots
- SELECT: authenticated users in same org
- INSERT: authenticated users in same org (admin/manager enforcement at app layer)
- NO UPDATE policy — snapshots are immutable once written
- NO DELETE policy — snapshots cannot be deleted through RLS

## Important Notes
1. Snapshots are immutable — no UPDATE or DELETE policies are created
2. No production tax calculations are changed — this is schema foundation only
3. The tax_snapshot_id FK on proposals/invoices/change_orders is nullable and starts NULL
*/

CREATE TABLE IF NOT EXISTS tax_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid DEFAULT get_user_org_id(),
  transaction_type text NOT NULL,
  transaction_id uuid NOT NULL,
  contact_id uuid,
  taxable_status text,
  tax_location_address jsonb,
  state char(2),
  jurisdiction_name text,
  state_rate numeric(7,6),
  county_rate numeric(7,6),
  city_rate numeric(7,6),
  district_rate numeric(7,6),
  combined_rate numeric(7,6),
  taxjar_verified_at timestamptz,
  nexus_result text,
  environment text,
  project_type text,
  matrix_rule_version integer,
  material_amount numeric(12,2),
  material_taxable_amount numeric(12,2),
  labor_amount numeric(12,2),
  labor_taxable_amount numeric(12,2),
  design_fee_amount numeric(12,2),
  design_fee_taxable_amount numeric(12,2),
  pm_amount numeric(12,2),
  pm_taxable_amount numeric(12,2),
  freight_amount numeric(12,2),
  freight_taxable_amount numeric(12,2),
  credit_card_fee_amount numeric(12,2),
  credit_card_fee_taxable_amount numeric(12,2),
  misc_percent numeric(5,2),
  misc_applies_to text,
  misc_amount numeric(12,2),
  custom_modifier_1_amount numeric(12,2),
  custom_modifier_1_taxable_amount numeric(12,2),
  custom_modifier_2_amount numeric(12,2),
  custom_modifier_2_taxable_amount numeric(12,2),
  exemption_reference text,
  taxable_subtotal numeric(12,2),
  sales_tax numeric(12,2),
  calculated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for looking up snapshots by transaction
CREATE INDEX IF NOT EXISTS tax_snapshots_transaction_idx
  ON tax_snapshots (organization_id, transaction_type, transaction_id);

-- Index for looking up snapshots by contact
CREATE INDEX IF NOT EXISTS tax_snapshots_contact_idx
  ON tax_snapshots (organization_id, contact_id);

ALTER TABLE tax_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tax_snapshots_select_same_org" ON tax_snapshots;
CREATE POLICY "tax_snapshots_select_same_org"
  ON tax_snapshots FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "tax_snapshots_insert_same_org" ON tax_snapshots;
CREATE POLICY "tax_snapshots_insert_same_org"
  ON tax_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

-- No UPDATE policy — snapshots are immutable
-- No DELETE policy — snapshots cannot be deleted via RLS

-- Add tax_snapshot_id FK to proposals, invoices, and change_orders
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'tax_snapshot_id'
  ) THEN
    ALTER TABLE proposals ADD COLUMN tax_snapshot_id uuid;
    ALTER TABLE proposals
      ADD CONSTRAINT proposals_tax_snapshot_fk
      FOREIGN KEY (tax_snapshot_id) REFERENCES tax_snapshots(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'tax_snapshot_id'
  ) THEN
    ALTER TABLE invoices ADD COLUMN tax_snapshot_id uuid;
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_tax_snapshot_fk
      FOREIGN KEY (tax_snapshot_id) REFERENCES tax_snapshots(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_orders' AND column_name = 'tax_snapshot_id'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN tax_snapshot_id uuid;
    ALTER TABLE change_orders
      ADD CONSTRAINT change_orders_tax_snapshot_fk
      FOREIGN KEY (tax_snapshot_id) REFERENCES tax_snapshots(id)
      ON DELETE SET NULL;
  END IF;
END $$;
