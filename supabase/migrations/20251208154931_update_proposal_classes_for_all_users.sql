/*
  # Update Proposal Classes for All Users

  1. Changes
    - Allow all authenticated users to insert, update, and delete classes
    - Add `default_class_id` to products table for default class assignment
    - Update product insertion to include default class

  2. Security
    - Update RLS policies to allow all authenticated users to manage classes
    - Classes can be used by anyone in the company

  3. Notes
    - Admin-created classes serve as defaults/templates
    - Users can create proposal-specific classes on the fly
*/

-- Update RLS policies for proposal_classes to allow all authenticated users
DROP POLICY IF EXISTS "Admins can insert classes" ON proposal_classes;
DROP POLICY IF EXISTS "Admins can update classes" ON proposal_classes;
DROP POLICY IF EXISTS "Admins can delete classes" ON proposal_classes;

CREATE POLICY "All users can insert classes"
  ON proposal_classes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "All users can update classes"
  ON proposal_classes FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "All users can delete classes"
  ON proposal_classes FOR DELETE
  TO authenticated
  USING (true);

-- Add default_class_id to products table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'default_class_id'
  ) THEN
    ALTER TABLE products ADD COLUMN default_class_id uuid REFERENCES proposal_classes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index on default_class_id
CREATE INDEX IF NOT EXISTS idx_products_default_class_id ON products(default_class_id);