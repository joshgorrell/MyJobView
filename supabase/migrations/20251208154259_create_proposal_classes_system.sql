/*
  # Create Proposal Classes System

  1. New Tables
    - `proposal_classes`
      - `id` (uuid, primary key)
      - `name` (text) - Class name like "Wiring", "TV's", "Sound Systems"
      - `description` (text) - Optional description
      - `color` (text) - Optional color for UI display
      - `sort_order` (integer) - Display order
      - `is_active` (boolean) - Whether class is active
      - `created_at` (timestamp)

  2. Changes
    - Add `class_id` to `proposal_line_items` table
    - Add `class_id` to `products` table

  3. Security
    - Enable RLS on `proposal_classes` table
    - Add policies for authenticated users

  4. Indexes
    - Add index on class_id in proposal_line_items
    - Add index on class_id in products
*/

-- Create proposal_classes table
CREATE TABLE IF NOT EXISTS proposal_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  color text DEFAULT '#3B82F6',
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Add class_id to proposal_line_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_line_items' AND column_name = 'class_id'
  ) THEN
    ALTER TABLE proposal_line_items ADD COLUMN class_id uuid REFERENCES proposal_classes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add class_id to products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'class_id'
  ) THEN
    ALTER TABLE products ADD COLUMN class_id uuid REFERENCES proposal_classes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_proposal_line_items_class_id ON proposal_line_items(class_id);
CREATE INDEX IF NOT EXISTS idx_products_class_id ON products(class_id);

-- Enable RLS
ALTER TABLE proposal_classes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for proposal_classes
CREATE POLICY "Users can view all classes"
  ON proposal_classes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert classes"
  ON proposal_classes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Admins can update classes"
  ON proposal_classes FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Admins can delete classes"
  ON proposal_classes FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- Insert some default classes
INSERT INTO proposal_classes (name, description, color, sort_order) VALUES
  ('Equipment', 'Equipment and devices', '#3B82F6', 1),
  ('Labor', 'Installation and labor costs', '#10B981', 2),
  ('Wiring', 'Cabling and wire runs', '#F59E0B', 3),
  ('Hardware', 'Mounting and hardware', '#6366F1', 4),
  ('Accessories', 'Additional accessories', '#8B5CF6', 5)
ON CONFLICT DO NOTHING;