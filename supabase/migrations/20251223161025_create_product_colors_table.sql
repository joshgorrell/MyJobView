/*
  # Create Product Colors Table

  1. New Tables
    - `product_colors`
      - `id` (uuid, primary key)
      - `name` (text, not null) - Color/finish name
      - `sort_order` (integer) - Display order
      - `is_active` (boolean) - Active/inactive status
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS
    - Allow authenticated users to read colors
    - Allow authenticated users to manage colors

  3. Notes
    - Used for dropdown selection in product forms
    - Provides consistent color/finish options across products
*/

-- Create product colors table
CREATE TABLE IF NOT EXISTS product_colors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE product_colors ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read colors
CREATE POLICY "Authenticated users can view colors"
  ON product_colors FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to manage colors
CREATE POLICY "Authenticated users can manage colors"
  ON product_colors FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create index for sorting
CREATE INDEX IF NOT EXISTS idx_product_colors_sort_order ON product_colors(sort_order);
CREATE INDEX IF NOT EXISTS idx_product_colors_active ON product_colors(is_active) WHERE is_active = true;

-- Insert common colors
INSERT INTO product_colors (name, sort_order) VALUES
  ('White', 1),
  ('Black', 2),
  ('Gray', 3),
  ('Silver', 4),
  ('Bronze', 5),
  ('Brown', 6),
  ('Beige', 7),
  ('Ivory', 8),
  ('Almond', 9),
  ('Stainless Steel', 10),
  ('Brushed Nickel', 11),
  ('Oil Rubbed Bronze', 12),
  ('Chrome', 13),
  ('Brass', 14),
  ('Clear', 15)
ON CONFLICT (name) DO NOTHING;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_product_colors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_product_colors_updated_at
  BEFORE UPDATE ON product_colors
  FOR EACH ROW
  EXECUTE FUNCTION update_product_colors_updated_at();
