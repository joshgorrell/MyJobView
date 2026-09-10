/*
# Stage A.13: Create Miscellaneous Item Product

## Purpose
Creates a "Miscellaneous Item" product in the Product Catalog. This product is reusable —
salespeople override the description, quantity, cost, and sell price on the proposal line only.
These overrides never modify the master product. Regardless of the custom description entered
on a proposal line, the line remains classified as Material for tax purposes.

## New Data
- Inserts one row into `products`:
  - name: 'Miscellaneous Item'
  - description: 'Reusable miscellaneous item — override description, qty, cost, and price on the proposal line.'
  - category: 'Misc'
  - sku: 'MISC-ITEM'
  - unit_price: 0 (salesperson overrides on the proposal line)
  - cost: 0
  - unit: 'ea'
  - is_active: true
  - is_taxable: true
  - item_type: 'material'
  - tax_classification_id: Material classification (c2040fe0-9519-46fe-bf39-bee25cd48c49)
  - organization_id: b324e4e3-cd2e-4c68-8df8-3e27c7e08f15

## Important Notes
1. The unit_price and cost are 0 because the salesperson always overrides them on the proposal line
2. The tax_classification_id is set to Material so the future tax engine always treats it as Material
3. No production calculations are changed
*/

INSERT INTO products (
  organization_id,
  name,
  description,
  category,
  sku,
  unit_price,
  cost,
  unit,
  is_active,
  is_taxable,
  item_type,
  tax_classification_id
)
SELECT
  'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15',
  'Miscellaneous Item',
  'Reusable miscellaneous item — override description, qty, cost, and price on the proposal line.',
  'Misc',
  'MISC-ITEM',
  0,
  0,
  'ea',
  true,
  true,
  'material',
  'c2040fe0-9519-46fe-bf39-bee25cd48c49'
WHERE NOT EXISTS (
  SELECT 1 FROM products
  WHERE organization_id = 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'
    AND sku = 'MISC-ITEM'
);
