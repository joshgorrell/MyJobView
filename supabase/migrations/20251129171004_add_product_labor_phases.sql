/*
  # Add Multi-Labor Phase Support to Products

  1. New Tables
    - `product_labor_phases`
      - `id` (uuid, primary key)
      - `product_id` (uuid, references products)
      - `labor_phase_id` (uuid, references labor_phases)
      - `hours` (numeric, labor hours for this phase)
      - `sort_order` (integer, for ordering multiple phases)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Changes
    - Allows products to have multiple labor phases with different hours
    - Maintains backward compatibility with single default_labor_hours field
    - When product_labor_phases exist, they override the default single phase

  3. Security
    - Enable RLS on product_labor_phases table
    - Authenticated users can manage labor phases for products
*/

-- Create product_labor_phases table
CREATE TABLE IF NOT EXISTS product_labor_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  labor_phase_id uuid NOT NULL REFERENCES labor_phases(id) ON DELETE CASCADE,
  hours numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_product_labor_phases_product_id ON product_labor_phases(product_id);
CREATE INDEX IF NOT EXISTS idx_product_labor_phases_labor_phase_id ON product_labor_phases(labor_phase_id);
CREATE INDEX IF NOT EXISTS idx_product_labor_phases_sort_order ON product_labor_phases(product_id, sort_order);

-- Enable RLS
ALTER TABLE product_labor_phases ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Authenticated users can view product labor phases" ON product_labor_phases;
CREATE POLICY "Authenticated users can view product labor phases"
  ON product_labor_phases FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage product labor phases" ON product_labor_phases;
CREATE POLICY "Authenticated users can manage product labor phases"
  ON product_labor_phases FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_product_labor_phases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_product_labor_phases_updated_at ON product_labor_phases;
CREATE TRIGGER update_product_labor_phases_updated_at
  BEFORE UPDATE ON product_labor_phases
  FOR EACH ROW
  EXECUTE FUNCTION update_product_labor_phases_updated_at();
