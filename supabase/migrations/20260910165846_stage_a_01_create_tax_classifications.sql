/*
# Stage A.1 + A.2: Create Tax Classifications and Special Charge Classifications Tables

## Purpose
Creates two foundational classification tables for the future central tax engine:
1. `tax_classifications` — normal product/line-item classifications (Material, Labor, Design Fee, Project Management)
2. `special_charge_classifications` — special charges that need independent tax treatment (Freight/Delivery, Credit Card Fee)

These tables are the controlled vocabulary the future State Tax Rules Matrix will reference. No taxability rules are created here — the matrix (created in a separate migration) will determine which classifications are taxable per state/environment/project type.

## New Tables

### tax_classifications
- `id` (uuid, PK)
- `organization_id` (uuid, defaults to get_user_org_id())
- `code` (text, unique per org — e.g. 'material', 'labor', 'design_fee', 'project_management')
- `label` (text — display name)
- `classification_type` (text — 'normal' for these four initial rows)
- `is_active` (boolean, default true)
- `sort_order` (integer, default 0)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

### special_charge_classifications
- `id` (uuid, PK)
- `organization_id` (uuid, defaults to get_user_org_id())
- `code` (text, unique per org — e.g. 'freight_delivery', 'credit_card_fee')
- `label` (text — display name)
- `charge_type` (text — 'customer_facing' or 'freight_in')
- `is_active` (boolean, default true)
- `sort_order` (integer, default 0)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

## Seeded Data
- tax_classifications: Material, Labor, Design Fee, Project Management (for org b324e4e3-cd2e-4c68-8df8-3e27c7e08f15)
- special_charge_classifications: Freight/Delivery (customer_facing), Credit Card Fee (customer_facing)

## Security
- RLS enabled on both tables
- SELECT: authenticated users can read their own org's classifications
- INSERT/UPDATE/DELETE: authenticated users in the same org (admin/manager enforcement at app layer)

## Important Notes
1. Discount is NOT a tax classification — it remains a price reduction/modifier only
2. Credit Card Fee is treated as a special charge (not folded into Material or Labor)
3. Freight-in is architecturally supported via charge_type='freight_in' but not seeded as a customer charge
4. No taxability rules are created for these classifications — that comes in a later stage
*/

-- ═════════════════════════════════════════════════════════════════════════════
-- A.1: tax_classifications table
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tax_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid DEFAULT get_user_org_id(),
  code text NOT NULL,
  label text NOT NULL,
  classification_type text NOT NULL DEFAULT 'normal',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

ALTER TABLE tax_classifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tax_classifications_select_same_org" ON tax_classifications;
CREATE POLICY "tax_classifications_select_same_org"
  ON tax_classifications FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "tax_classifications_insert_same_org" ON tax_classifications;
CREATE POLICY "tax_classifications_insert_same_org"
  ON tax_classifications FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "tax_classifications_update_same_org" ON tax_classifications;
CREATE POLICY "tax_classifications_update_same_org"
  ON tax_classifications FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "tax_classifications_delete_same_org" ON tax_classifications;
CREATE POLICY "tax_classifications_delete_same_org"
  ON tax_classifications FOR DELETE
  TO authenticated
  USING (organization_id = get_user_org_id());

-- Seed the four initial normal classifications for the existing organization
INSERT INTO tax_classifications (organization_id, code, label, classification_type, sort_order)
SELECT 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', v.code, v.label, 'normal', v.sort_order
FROM (VALUES
  ('material',          'Material',           1),
  ('labor',             'Labor',              2),
  ('design_fee',        'Design Fee',         3),
  ('project_management','Project Management', 4)
) AS v(code, label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM tax_classifications
  WHERE organization_id = 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'
    AND code = v.code
);

-- ═════════════════════════════════════════════════════════════════════════════
-- A.2: special_charge_classifications table
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS special_charge_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid DEFAULT get_user_org_id(),
  code text NOT NULL,
  label text NOT NULL,
  charge_type text NOT NULL DEFAULT 'customer_facing',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

ALTER TABLE special_charge_classifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "special_charge_select_same_org" ON special_charge_classifications;
CREATE POLICY "special_charge_select_same_org"
  ON special_charge_classifications FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "special_charge_insert_same_org" ON special_charge_classifications;
CREATE POLICY "special_charge_insert_same_org"
  ON special_charge_classifications FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "special_charge_update_same_org" ON special_charge_classifications;
CREATE POLICY "special_charge_update_same_org"
  ON special_charge_classifications FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "special_charge_delete_same_org" ON special_charge_classifications;
CREATE POLICY "special_charge_delete_same_org"
  ON special_charge_classifications FOR DELETE
  TO authenticated
  USING (organization_id = get_user_org_id());

-- Seed the two initial special charge classifications for the existing organization
INSERT INTO special_charge_classifications (organization_id, code, label, charge_type, sort_order)
SELECT 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', v.code, v.label, v.charge_type, v.sort_order
FROM (VALUES
  ('freight_delivery',  'Freight/Delivery',  'customer_facing', 1),
  ('credit_card_fee',   'Credit Card Fee',   'customer_facing', 2)
) AS v(code, label, charge_type, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM special_charge_classifications
  WHERE organization_id = 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'
    AND code = v.code
);
