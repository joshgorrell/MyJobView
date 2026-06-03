/*
  # Add include_labor to product package items

  1. Changes
    - Add `include_labor` column to `product_package_items` table
      - Defaults to false (user must explicitly opt-in to include labor)

  2. Purpose
    - Allows packages to specify whether labor should be included for each product item
    - User can decide per-item whether to include labor costs/hours
*/

-- Add include_labor column
ALTER TABLE product_package_items
ADD COLUMN IF NOT EXISTS include_labor boolean DEFAULT false;

COMMENT ON COLUMN product_package_items.include_labor IS 'Whether to include labor hours/cost for this product in the package';
