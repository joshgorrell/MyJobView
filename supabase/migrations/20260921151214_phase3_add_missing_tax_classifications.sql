/*
# Add Missing Tax Classifications

## Purpose
The `tax_classifications` table currently has only 4 of 6 required classifications
(material, labor, design_fee, project_management). The two missing classifications
are `freight_delivery` and `credit_card_fee`, which exist in `master_classifications`
but not in `tax_classifications`.

This migration adds the two missing rows so that all 6 classifications are available
as FK targets for `tax_classification_id` on proposal_line_items, change_order_line_items,
invoice_line_items, and other tables.

## Changes
1. Insert `freight_delivery` classification into `tax_classifications` for the
   existing organization, matching the code and label from `master_classifications`.
2. Insert `credit_card_fee` classification into `tax_classifications` for the
   existing organization, matching the code and label from `master_classifications`.
3. Both rows use the same `organization_id` as the existing 4 rows, with
   `classification_type = 'normal'` and `is_active = true`.

## Safety
- Uses IF NOT EXISTS checks to be idempotent.
- Does not modify existing rows.
- Does not change any FK constraints.
*/

DO $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Get the organization_id from existing tax_classifications rows
  SELECT organization_id INTO v_org_id
  FROM tax_classifications LIMIT 1;

  IF v_org_id IS NULL THEN
    -- Fallback: use get_user_org_id() if no rows exist
    v_org_id := get_user_org_id();
  END IF;

  -- Insert freight_delivery if it doesn't exist for this org
  IF NOT EXISTS (
    SELECT 1 FROM tax_classifications WHERE code = 'freight_delivery' AND organization_id = v_org_id
  ) THEN
    INSERT INTO tax_classifications (id, organization_id, code, label, classification_type, is_active, sort_order, created_at, updated_at)
    SELECT
      gen_random_uuid(),
      v_org_id,
      'freight_delivery',
      'Freight/Delivery',
      'normal',
      true,
      5,
      now(),
      now()
    WHERE NOT EXISTS (
      SELECT 1 FROM tax_classifications WHERE code = 'freight_delivery' AND organization_id = v_org_id
    );
  END IF;

  -- Insert credit_card_fee if it doesn't exist for this org
  IF NOT EXISTS (
    SELECT 1 FROM tax_classifications WHERE code = 'credit_card_fee' AND organization_id = v_org_id
  ) THEN
    INSERT INTO tax_classifications (id, organization_id, code, label, classification_type, is_active, sort_order, created_at, updated_at)
    SELECT
      gen_random_uuid(),
      v_org_id,
      'credit_card_fee',
      'Credit Card Fee',
      'normal',
      true,
      6,
      now(),
      now()
    WHERE NOT EXISTS (
      SELECT 1 FROM tax_classifications WHERE code = 'credit_card_fee' AND organization_id = v_org_id
    );
  END IF;
END $$;
