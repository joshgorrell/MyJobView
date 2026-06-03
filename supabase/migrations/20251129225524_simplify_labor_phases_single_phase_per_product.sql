/*
  # Simplify Labor Phases - Single Phase Per Product

  1. Changes
    - Remove product_labor_phases table (no longer needed)
    - Each product can only have one labor phase now
    - Labor phase and hours are stored directly on the product
    - Line items will show: product + labor phase + hours on same row

  2. Notes
    - This simplifies the proposal UI - no more multiple phase selection
    - Each line item has material price + labor (hours × rate) = total installed price
    - Labor phase is optional per product
*/

-- Drop the product_labor_phases table as we're simplifying to one phase per product
DROP TABLE IF EXISTS product_labor_phases CASCADE;
