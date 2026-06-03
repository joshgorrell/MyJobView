/*
  # Fix Unindexed Foreign Keys - Corrected Batch 3 Fixed
  
  1. Performance Optimization
    - Add indexes to foreign key columns in product and inventory tables
    - Improves catalog browsing and inventory management performance
    
  2. Tables Covered
    - products (category_id, subcategory_id, manufacturer_id, vendor_id, labor_phase_id, created_by, updated_by, default_vendor_id, class_id, default_class_id)
    - product_packages (labor_phase_id, category_id)
    - product_package_items (package_id, product_id)
*/

-- Products table indexes
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_subcategory_id ON products(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_products_manufacturer_id ON products(manufacturer_id);
CREATE INDEX IF NOT EXISTS idx_products_vendor_id ON products(vendor_id);
CREATE INDEX IF NOT EXISTS idx_products_labor_phase_id ON products(labor_phase_id);
CREATE INDEX IF NOT EXISTS idx_products_created_by ON products(created_by);
CREATE INDEX IF NOT EXISTS idx_products_updated_by ON products(updated_by);
CREATE INDEX IF NOT EXISTS idx_products_default_vendor_id ON products(default_vendor_id);
CREATE INDEX IF NOT EXISTS idx_products_class_id ON products(class_id);
CREATE INDEX IF NOT EXISTS idx_products_default_class_id ON products(default_class_id);

-- Product packages indexes
CREATE INDEX IF NOT EXISTS idx_product_packages_labor_phase_id ON product_packages(labor_phase_id);
CREATE INDEX IF NOT EXISTS idx_product_packages_category_id ON product_packages(category_id);

-- Product package items indexes
CREATE INDEX IF NOT EXISTS idx_product_package_items_package_id ON product_package_items(package_id);
CREATE INDEX IF NOT EXISTS idx_product_package_items_product_id ON product_package_items(product_id);