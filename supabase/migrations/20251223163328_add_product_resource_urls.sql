/*
  # Add Product Resource URLs

  1. Changes
    - Add `manufacturer_url` - Link to manufacturer product page
    - Add `supplier_url` - Link to supplier/vendor product page
    - Add `installation_video_url` - Link to installation video/tutorial
    
  2. Notes
    - These fields supplement the existing `product_link` and `datasheet_url` fields
    - All URLs are optional and stored as text
*/

ALTER TABLE products
ADD COLUMN IF NOT EXISTS manufacturer_url text,
ADD COLUMN IF NOT EXISTS supplier_url text,
ADD COLUMN IF NOT EXISTS installation_video_url text;

COMMENT ON COLUMN products.manufacturer_url IS 'URL to manufacturer product page';
COMMENT ON COLUMN products.supplier_url IS 'URL to supplier/vendor product page';
COMMENT ON COLUMN products.installation_video_url IS 'URL to installation video or tutorial';
