/*
  # Add Package Thumbnail Support

  1. Changes
    - Add `thumbnail_url` column to `product_packages` table for package images
    - This will be used to display package images in proposals and lists

  2. Security
    - No RLS changes needed - inherits existing package access controls
*/

-- Add thumbnail_url to product_packages
ALTER TABLE product_packages
ADD COLUMN IF NOT EXISTS thumbnail_url text;

-- Add index for performance when filtering packages with images
CREATE INDEX IF NOT EXISTS idx_product_packages_thumbnail
  ON product_packages(thumbnail_url)
  WHERE thumbnail_url IS NOT NULL;
