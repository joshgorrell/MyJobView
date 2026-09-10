/*
# Stage A.3: Add tax_classification_id to Product and Transaction Tables

## Purpose
Adds a nullable `tax_classification_id` foreign key column to five tables so each product
and each line item can reference a controlled tax classification (Material, Labor, Design Fee,
Project Management). This is the foundation the future central tax engine will use to determine
taxability per state rule.

## Modified Tables
1. `products` — adds nullable `tax_classification_id` FK to tax_classifications(id)
2. `proposal_line_items` — adds nullable `tax_classification_id` FK
3. `invoice_line_items` — adds nullable `tax_classification_id` FK
4. `change_order_line_items` — adds nullable `tax_classification_id` FK
5. `recurring_plans` — adds nullable `tax_classification_id` FK

## Backfill
All existing products with `item_type = 'material'` are mapped to the Material classification.
Products with `item_type = 'both'` are NOT auto-mapped (none exist today, but the architecture
handles them — they will be listed in the completion report for manual assignment if any appear).

## Security
No RLS policy changes — existing per-table RLS covers the new column.

## Important Notes
1. All columns are nullable so existing data is not broken
2. FK constraints use ON DELETE SET NULL so deleting a classification doesn't orphan rows
3. No production tax calculations are changed — this is schema foundation only
*/

DO $$ BEGIN
  -- products
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'tax_classification_id'
  ) THEN
    ALTER TABLE products ADD COLUMN tax_classification_id uuid;
    ALTER TABLE products
      ADD CONSTRAINT products_tax_classification_fk
      FOREIGN KEY (tax_classification_id) REFERENCES tax_classifications(id)
      ON DELETE SET NULL;
  END IF;

  -- proposal_line_items
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_line_items' AND column_name = 'tax_classification_id'
  ) THEN
    ALTER TABLE proposal_line_items ADD COLUMN tax_classification_id uuid;
    ALTER TABLE proposal_line_items
      ADD CONSTRAINT proposal_line_items_tax_classification_fk
      FOREIGN KEY (tax_classification_id) REFERENCES tax_classifications(id)
      ON DELETE SET NULL;
  END IF;

  -- invoice_line_items
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_line_items' AND column_name = 'tax_classification_id'
  ) THEN
    ALTER TABLE invoice_line_items ADD COLUMN tax_classification_id uuid;
    ALTER TABLE invoice_line_items
      ADD CONSTRAINT invoice_line_items_tax_classification_fk
      FOREIGN KEY (tax_classification_id) REFERENCES tax_classifications(id)
      ON DELETE SET NULL;
  END IF;

  -- change_order_line_items
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_order_line_items' AND column_name = 'tax_classification_id'
  ) THEN
    ALTER TABLE change_order_line_items ADD COLUMN tax_classification_id uuid;
    ALTER TABLE change_order_line_items
      ADD CONSTRAINT change_order_line_items_tax_classification_fk
      FOREIGN KEY (tax_classification_id) REFERENCES tax_classifications(id)
      ON DELETE SET NULL;
  END IF;

  -- recurring_plans
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recurring_plans' AND column_name = 'tax_classification_id'
  ) THEN
    ALTER TABLE recurring_plans ADD COLUMN tax_classification_id uuid;
    ALTER TABLE recurring_plans
      ADD CONSTRAINT recurring_plans_tax_classification_fk
      FOREIGN KEY (tax_classification_id) REFERENCES tax_classifications(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Backfill: map existing material products to the Material classification
UPDATE products
SET tax_classification_id = (
  SELECT id FROM tax_classifications
  WHERE organization_id = 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'
    AND code = 'material'
)
WHERE item_type = 'material'
  AND tax_classification_id IS NULL
  AND organization_id = 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15';
