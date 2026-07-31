/*
# Eliminate Ghost Line Items — Enforce product_id NOT NULL

## Purpose
Every proposal line item and change order line item must reference a real catalog
product. Previously a "one-off item" feature allowed items to be added to proposals
without a product_id, creating ghost items that are hard to track and manage.

## Changes

### 1. Backfill ghost proposal_line_items (5 rows)
For each proposal_line_items row with product_id IS NULL:
- Create a new products row using the line item's description, unit_price, cost,
  unit, item_type, and organization_id.
- Set the line item's product_id to the newly created product's id.

### 2. Backfill ghost change_order_line_items (7 rows)
For each change_order_line_items row with product_id IS NULL:
- Match by product_name to an existing product (case-insensitive) within the same
  organization. If no match found, create a new products row.
- Set the change order line item's product_id.

### 3. Add NOT NULL constraint
- ALTER TABLE proposal_line_items ALTER COLUMN product_id SET NOT NULL
- ALTER TABLE change_order_line_items ALTER COLUMN product_id SET NOT NULL

Foreign key constraints to products.id already exist on both tables.

## Security
No RLS policy changes — existing policies remain in effect.
*/

-- ── Step 1: Backfill proposal_line_items with null product_id ──

DO $$
DECLARE
  ghost_row RECORD;
  new_product_id uuid;
BEGIN
  FOR ghost_row IN
    SELECT id, description, unit_price, cost, unit, item_type, organization_id
    FROM proposal_line_items
    WHERE product_id IS NULL
  LOOP
    -- Try to match an existing product by name (case-insensitive) in the same org
    SELECT p.id INTO new_product_id
    FROM products p
    WHERE p.name ILIKE ghost_row.description
      AND p.organization_id = ghost_row.organization_id
    LIMIT 1;

    -- If no match, create a new product
    IF new_product_id IS NULL THEN
      INSERT INTO products (
        name, unit_price, cost, unit, item_type, organization_id,
        is_active, created_at, updated_at
      ) VALUES (
        ghost_row.description,
        ghost_row.unit_price,
        COALESCE(ghost_row.cost, 0),
        COALESCE(ghost_row.unit, 'each'),
        COALESCE(ghost_row.item_type, 'material'),
        ghost_row.organization_id,
        true,
        now(), now()
      )
      RETURNING id INTO new_product_id;
    END IF;

    -- Link the line item to the product
    UPDATE proposal_line_items
    SET product_id = new_product_id
    WHERE id = ghost_row.id;
  END LOOP;
END $$;

-- ── Step 2: Backfill change_order_line_items with null product_id ──

DO $$
DECLARE
  ghost_row RECORD;
  new_product_id uuid;
BEGIN
  FOR ghost_row IN
    SELECT id, product_name, new_unit_price, item_type, organization_id
    FROM change_order_line_items
    WHERE product_id IS NULL
  LOOP
    -- Try to match an existing product by name (case-insensitive) in the same org
    SELECT p.id INTO new_product_id
    FROM products p
    WHERE p.name ILIKE ghost_row.product_name
      AND p.organization_id = ghost_row.organization_id
    LIMIT 1;

    -- If no match, create a new product
    IF new_product_id IS NULL THEN
      INSERT INTO products (
        name, unit_price, cost, unit, item_type, organization_id,
        is_active, created_at, updated_at
      ) VALUES (
        ghost_row.product_name,
        ghost_row.new_unit_price,
        0,
        'each',
        COALESCE(ghost_row.item_type, 'material'),
        ghost_row.organization_id,
        true,
        now(), now()
      )
      RETURNING id INTO new_product_id;
    END IF;

    -- Link the change order line item to the product
    UPDATE change_order_line_items
    SET product_id = new_product_id
    WHERE id = ghost_row.id;
  END LOOP;
END $$;

-- ── Step 3: Enforce NOT NULL on product_id ──

ALTER TABLE proposal_line_items ALTER COLUMN product_id SET NOT NULL;
ALTER TABLE change_order_line_items ALTER COLUMN product_id SET NOT NULL;
