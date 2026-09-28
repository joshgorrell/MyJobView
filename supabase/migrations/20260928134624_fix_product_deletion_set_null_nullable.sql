/*
# Fix product deletion: make product_id nullable on SET NULL foreign keys

## Problem
Three tables reference `products.id` with `ON DELETE SET NULL`, but their
`product_id` column is `NOT NULL`. This makes it impossible to delete any
product that is referenced in those tables — Postgres tries to SET NULL
the foreign key column, but the NOT NULL constraint rejects it, causing
a constraint violation error.

## Fix
Make `product_id` nullable on the three affected tables so the SET NULL
delete rule can actually work as intended. When a product is deleted, the
line item / task row is preserved but its `product_id` becomes NULL,
keeping the historical record without blocking the delete.

## Affected Tables
1. `proposal_line_items.product_id` — now nullable
2. `change_order_line_items.product_id` — now nullable
3. `catalog_item_default_tasks.product_id` — now nullable

## Security
No RLS or policy changes. Existing policies remain unchanged.
*/

ALTER TABLE proposal_line_items ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE change_order_line_items ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE catalog_item_default_tasks ALTER COLUMN product_id DROP NOT NULL;
