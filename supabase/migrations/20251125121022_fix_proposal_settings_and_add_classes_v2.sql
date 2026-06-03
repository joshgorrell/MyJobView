/*
  # Fix Proposal Settings and Add Class Templates

  1. Changes
    - Remove company_id requirement from proposal_area_templates (single-tenant)
    - Create proposal_class_templates table for managing classes
    - Add default areas and classes for common use cases
  
  2. Tables
    - proposal_area_templates: For room/area types (Kitchen, Bathroom, etc.)
    - proposal_class_templates: For product classes (Basic, Standard, Premium, etc.)
*/

-- Remove company_id requirement from area templates (make it nullable for single-tenant)
ALTER TABLE proposal_area_templates 
ALTER COLUMN company_id DROP NOT NULL;

-- Create proposal class templates table
CREATE TABLE IF NOT EXISTS proposal_class_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE proposal_class_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for proposal_class_templates
CREATE POLICY "Anyone can view class templates"
  ON proposal_class_templates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert class templates"
  ON proposal_class_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update class templates"
  ON proposal_class_templates
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete class templates"
  ON proposal_class_templates
  FOR DELETE
  TO authenticated
  USING (true);

-- Insert default area templates if none exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM proposal_area_templates LIMIT 1) THEN
    INSERT INTO proposal_area_templates (name, sort_order, company_id)
    VALUES
      ('Living Room', 1, NULL),
      ('Kitchen', 2, NULL),
      ('Master Bedroom', 3, NULL),
      ('Bedroom', 4, NULL),
      ('Bathroom', 5, NULL),
      ('Dining Room', 6, NULL),
      ('Office', 7, NULL),
      ('Basement', 8, NULL),
      ('Garage', 9, NULL),
      ('Exterior', 10, NULL),
      ('Attic', 11, NULL),
      ('Hallway', 12, NULL);
  END IF;
END $$;

-- Insert default class templates
INSERT INTO proposal_class_templates (name, description, sort_order)
VALUES
  ('Basic', 'Entry-level products and materials', 1),
  ('Standard', 'Mid-range products and materials', 2),
  ('Premium', 'High-end products and materials', 3),
  ('Luxury', 'Top-tier products and materials', 4)
ON CONFLICT DO NOTHING;

-- Update RLS policies for area templates to not require company_id
DROP POLICY IF EXISTS "Anyone can view area templates" ON proposal_area_templates;
DROP POLICY IF EXISTS "Authenticated users can insert area templates" ON proposal_area_templates;
DROP POLICY IF EXISTS "Authenticated users can update area templates" ON proposal_area_templates;
DROP POLICY IF EXISTS "Authenticated users can delete area templates" ON proposal_area_templates;

CREATE POLICY "Anyone can view area templates"
  ON proposal_area_templates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert area templates"
  ON proposal_area_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update area templates"
  ON proposal_area_templates
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete area templates"
  ON proposal_area_templates
  FOR DELETE
  TO authenticated
  USING (true);

COMMENT ON TABLE proposal_class_templates IS 'Templates for proposal product classes (Basic, Standard, Premium, etc.)';
COMMENT ON TABLE proposal_area_templates IS 'Templates for proposal areas/rooms (Living Room, Kitchen, etc.)';
