/*
# Phase 2: Migrate products.default_install_task into catalog_item_default_tasks

## Purpose
Migrate the 22 existing `products.default_install_task` values into the
`catalog_item_default_tasks` table so they become proper structured default tasks.

## What This Does
1. For each product where `default_install_task` is non-empty, insert one row
   into `catalog_item_default_tasks` with:
   - title = the existing default_install_task text
   - sort_order = 0
   - labor_phase_id = NULL
   - organization_id copied from the product row
2. Idempotent: skip products that already have a matching catalog_item_default_tasks
   row (matched on product_id + title)
3. The `products.default_install_task` column is NOT removed or altered

## Data Summary
- 22 products have non-empty default_install_task values
- Each gets one catalog_item_default_tasks row
- organization_id is sourced from the products table

## Security
- No schema changes, no RLS policy changes
- Data-only migration into existing table

## Important Notes
1. Idempotent -- safe to re-run
2. products.default_install_task column stays in place
3. Existing catalog_item_default_tasks rows are not modified
*/

INSERT INTO catalog_item_default_tasks (product_id, title, sort_order, labor_phase_id, organization_id)
SELECT p.id, p.default_install_task, 0, NULL, p.organization_id
FROM products p
WHERE p.default_install_task IS NOT NULL
  AND p.default_install_task != ''
  AND NOT EXISTS (
    SELECT 1
    FROM catalog_item_default_tasks cidt
    WHERE cidt.product_id = p.id
      AND cidt.title = p.default_install_task
  );
