/*
  # Add Product Categories and Subcategories System

  1. New Tables
    - `product_categories`
      - `id` (uuid, primary key)
      - `name` (text, category name)
      - `description` (text, optional description)
      - `sort_order` (integer, display order)
      - `is_active` (boolean, active status)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `product_subcategories`
      - `id` (uuid, primary key)
      - `category_id` (uuid, foreign key to product_categories)
      - `name` (text, subcategory name)
      - `description` (text, optional description)
      - `sort_order` (integer, display order)
      - `is_active` (boolean, active status)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Changes to Products Table
    - Add `category_id` (uuid, foreign key to product_categories)
    - Add `subcategory_id` (uuid, foreign key to product_subcategories)

  3. Security
    - Enable RLS on new tables
    - Add policies for authenticated users
*/

-- Create product_categories table
CREATE TABLE IF NOT EXISTS product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create product_subcategories table
CREATE TABLE IF NOT EXISTS product_subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES product_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add category and subcategory to products table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'category_id'
  ) THEN
    ALTER TABLE products ADD COLUMN category_id uuid REFERENCES product_categories(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'subcategory_id'
  ) THEN
    ALTER TABLE products ADD COLUMN subcategory_id uuid REFERENCES product_subcategories(id);
  END IF;
END $$;

-- Enable RLS
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_subcategories ENABLE ROW LEVEL SECURITY;

-- RLS Policies for product_categories
CREATE POLICY "Anyone can view active categories"
  ON product_categories FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage categories"
  ON product_categories FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- RLS Policies for product_subcategories
CREATE POLICY "Anyone can view active subcategories"
  ON product_subcategories FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage subcategories"
  ON product_subcategories FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_product_categories_active ON product_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_product_subcategories_category ON product_subcategories(category_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products(subcategory_id);

-- Seed some common categories
INSERT INTO product_categories (name, sort_order) VALUES
  ('Speakers', 1),
  ('Amplifiers', 2),
  ('Sources', 3),
  ('Video', 4),
  ('Lighting', 5),
  ('Shades', 6),
  ('Networking', 7),
  ('Accessories', 8)
ON CONFLICT DO NOTHING;

-- Seed some common subcategories for Speakers
INSERT INTO product_subcategories (category_id, name, sort_order)
SELECT id, 'In-Wall', 1 FROM product_categories WHERE name = 'Speakers'
UNION ALL
SELECT id, 'In-Ceiling', 2 FROM product_categories WHERE name = 'Speakers'
UNION ALL
SELECT id, 'Outdoor', 3 FROM product_categories WHERE name = 'Speakers'
UNION ALL
SELECT id, 'Soundbar', 4 FROM product_categories WHERE name = 'Speakers'
UNION ALL
SELECT id, 'Subwoofer', 5 FROM product_categories WHERE name = 'Speakers'
ON CONFLICT DO NOTHING;