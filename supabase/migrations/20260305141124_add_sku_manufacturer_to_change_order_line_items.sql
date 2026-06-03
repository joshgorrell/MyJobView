/*
  # Add SKU and Manufacturer Name to Change Order Line Items

  ## Changes
  - `change_order_line_items` table:
    - Add `sku` (text, nullable) — snapshot of the product SKU at time of CO creation
    - Add `manufacturer_name` (text, nullable) — snapshot of manufacturer name at time of CO creation

  These fields mirror the snapshot pattern used in proposal line items and invoice line items,
  so the change order builder can display the same columns as the proposal builder.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_order_line_items' AND column_name = 'sku'
  ) THEN
    ALTER TABLE change_order_line_items ADD COLUMN sku text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_order_line_items' AND column_name = 'manufacturer_name'
  ) THEN
    ALTER TABLE change_order_line_items ADD COLUMN manufacturer_name text;
  END IF;
END $$;
